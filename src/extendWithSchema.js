import { z } from "zod";
import { Mongo } from "meteor/mongo";

import { unsupportedOps } from "./utils/unsupportedOps";
import { extendWithUser } from "./extendWithUser";
import { extendWithDates } from "./extendWithDates";
import { ValidationError } from "./ValidationError";


const removeAsync = Mongo.Collection.prototype.removeAsync;
const writeMethods = ["insertAsync", "updateAsync", "upsertAsync"];

Object.assign(Mongo.Collection.prototype, {
  _schema: null,
  _withDates: false,
  _softDelete: false,
  withSchema(schema) {
    this._schema = schema;

    return this;
  },
  withUser() {
    this._withUser = true;

    this._schema = this._schema.extend({
      userId: z.string().length(17),
    });

    return this;
  },
  withDates() {
    this._withDates = true;

    this._schema = this._schema.extend({
      createdAt: z.date(),
      updatedAt: z.date(),
    });

    return this;
  },
  withSoftDelete() {
    this._softDelete = true;

    this._schema = this._schema.extend({
      isDeleted: z.boolean().default(false),
      deletedAt: z.date().optional(),
    });

    return this;
  },

  async removeAsync(params) {
    if (this._softDelete) {
      return await this.updateAsync(params, {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
        },
      });
    }

    return await removeAsync.call(this, params);
  },
  async recoverAsync(params) {
    if (!this._softDelete) {
      throw new Meteor.Error(
        "SOFT_DELETE_DISABLED",
        "Soft delete is not enabled for this collection.");
    }

    return await this.updateAsync(params, {
      $unset: {
        deletedAt: true,
      },
      $set: {
        isDeleted: false,
      },
    });
  },
});

writeMethods.forEach(methodName => {
  const method = Mongo.Collection.prototype[methodName];

  Mongo.Collection.prototype[methodName] = function(...args) {
    const options = args[args.length - 1];
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const collection = this;
    const { _name, _schema, _withUser, _withDates } = collection;

    if (options?.skipSchema) {
      return method.apply(collection, args);
    }

    if (!_schema) {
      return method.apply(collection, args);
    }

    const isUpdate = ["update", "updateAsync"].includes(methodName);
    const isUpsert = (isUpdate && (args[2]?.hasOwnProperty("upsert") || false) && args[2]["upsert"]);
    const isUserServicesUpdate = isUpdate && _name === "users" && Object.keys(Object.values(args[1])[0])[0].split(".")[0] === "services";

    // If you do have a Meteor.users schema, then this prevents a check on Meteor.users.services updates that run periodically to resume login tokens and other things that don't need validation
    if (isUserServicesUpdate || ["upsert", "upsertAsync"].includes(methodName)) {
      return method.apply(collection, args);
    }

    if (_withDates) {
      extendWithDates(args, { isUpsert, isUpdate });
    }

    if (_withUser) {
      extendWithUser(args, { isUpsert, isUpdate });
    }

    const schemaToCheck = isUpdate ? _schema.deepPartial() : _schema;

    try {
      if (isUpsert) {
        if (args[1].$set) {
          args[1].$set = _schema.deepPartial().parse(args[1].$set);
        }

        if (args[1].$setOnInsert) {
          args[1].$setOnInsert = _schema.partial().parse(args[1].$setOnInsert);
        }
      } else if (isUpdate) {
        Object.keys(args[1]).forEach((key) => {
          if (key === "$push" || key === "$addToSet") {
            const fields = Object.keys(args[1][key]);

            fields.forEach((field) => {
              const fieldSchema = schemaFromPath(_schema, field);

              checkFieldExists(fieldSchema, field);
              checkFieldIsArray(fieldSchema, field);

              const elementSchema = fieldSchema instanceof z.ZodArray ? fieldSchema.element : fieldSchema._def.innerType.element;

              if (args[1][key][field]?.["$each"]) {
                const schema = z.object({
                  $each: fieldSchema,
                  $position: z.number().int().optional(),
                  $slice: z.number().int().optional(),
                  $sort: z.union([
                    z.record(z.string(), z.union([z.literal(1), z.literal(-1)])),
                    z.literal(1),
                    z.literal(-1),
                  ]).optional(),
                });

                args[1][key][field] = schema.parse(args[1][key][field]);
              } else {
                args[1][key][field] = elementSchema.parse(args[1][key][field]);
              }
            });
          } else if (key === "$pop") {
            const fields = Object.keys(args[1][key]);

            fields.forEach((field) => {
              const fieldSchema = schemaFromPath(_schema, field);

              checkFieldExists(fieldSchema, field);
              checkFieldIsArray(fieldSchema, field);

              if (![1, -1].includes(args[1][key][field])) {
                throw new ValidationError([{
                  name: key,
                  type: "invalid_array_pop_operation",
                  message: `${key} is not a valid array $pop operation. $pop value must be 1 or -1.`,
                }], "Invalid array $pop operation");
              }
            });
          } else if (unsupportedOps.includes(key)) {
            // TODO: Support these operations
          } else {
            const newValue = schemaToCheck.parse(args[1][key]);
            const { validNestedFields, errors } = validateNestedFields(args[1][key], _schema);

            if (errors.length > 0) {
              throw new ValidationError(errors, "Nested fields validation error");
            }

            args[1][key] = Object.assign(newValue, validNestedFields);
          }
        });
      } else {
        args[0] = schemaToCheck.parse(args[0]);
      }
    } catch (e) {
      if (e instanceof z.ZodError) {
        throw new ValidationError(e.issues?.map((err) => {
          const { path = [], keys = [], code, ...rest } = err;
          const fullPath = [...path, ...keys].join(".");

          return {
            name: fullPath,
            type: code,
            ...rest,
          };
        }), "Collection schema validation error");
      }

      throw e;
    }

    return method.apply(collection, args);
  };
});


function schemaFromPath(schema, path) {
  const pathSegments = path.split(".");

  // Traverse the schema by following the path segments
  let currentSchema = schema;

  for (const segment of pathSegments) {
    if (currentSchema instanceof z.ZodObject) {
      currentSchema = currentSchema.shape[segment];
    } else if (currentSchema instanceof z.ZodOptional) {
      currentSchema = currentSchema.unwrap().shape[segment];
    } else {
      return undefined; // Path does not exist or is not an object
    }
  }

  if (currentSchema instanceof z.ZodOptional) {
    return currentSchema.unwrap();
  }

  // Check if the final field is an array
  return currentSchema;
}

function checkFieldExists(schema, field) {
  if (!schema) {
    throw new ValidationError([{
      name: field,
      type: "invalid_field",
      message: `${field} does not exist`,
    }], "Invalid field");
  }
}

function checkFieldIsArray(schema, field) {
  const fieldIsArray = schema instanceof z.ZodArray;

  if (!fieldIsArray) {
    throw new ValidationError([{
      name: field,
      type: "invalid_array_field",
      message: `${field} is not a valid array`,
    }], "Invalid array field");
  }
}

function validateNestedFields(object, schema) {
  const nestedFields = Object.keys(object).filter((key) => key.includes("."));
  const validNestedFields = {};
  const errors = [];

  nestedFields.forEach((field) => {
    const nestedSchema = schemaFromPath(schema, field);

    if (!nestedSchema) {
      return;
    }

    const { success, data, error } = nestedSchema.safeParse(object[field]);

    if (success) {
      validNestedFields[field] = data;
    } else {
      error.issues.forEach((err) => {
        errors.push({
          name: field,
          type: err.code,
          message: err.message,
        });
      });
    }
  });

  return { validNestedFields, errors };
}