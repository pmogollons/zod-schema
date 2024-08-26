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
              const fieldSchema = schemaToCheck.shape[field];

              if (fieldSchema && (fieldSchema instanceof z.ZodArray || (fieldSchema instanceof z.ZodOptional && fieldSchema._def.innerType instanceof z.ZodArray))) {
                const elementSchema = fieldSchema instanceof z.ZodArray ? fieldSchema.element : fieldSchema._def.innerType.element;

                if (args[1][key][field]?.["$each"]) {
                  args[1][key][field]["$each"] = fieldSchema.parse(args[1][key][field]["$each"]);
                } else {
                  args[1][key][field] = elementSchema.parse(args[1][key][field]);
                }
              } else {
                throw new ValidationError([{
                  name: [key, field].join("."),
                  type: "invalid_array_operation",
                  message: `${key} is not a valid array operation`,
                }], "Invalid array operation");
              }
            });
          } else if (unsupportedOps.includes(key)) {
            // TODO: Support these operations
          } else {
            args[1][key] = schemaToCheck.parse(args[1][key]);
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
