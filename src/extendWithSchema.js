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
  _withUser: false,
  _withDates: false,
  _softDelete: false,
  withSchema(schema) {
    this._schema = schema;

    return this;
  },
  withUser({ optional = false } = {}) {
    this._withUser = true;

    if (optional) {
      this._schema = this._schema.extend({
        userId: z.string().length(17).optional(),
      });
    } else {
      this._schema = this._schema.extend({
        userId: z.string().length(17),
      });
    }

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
    const isUpsert = isUpdate && Object.prototype.hasOwnProperty.call(args[2] || {}, "upsert") && args[2]["upsert"];
    const isReplacementUpsert = isUpsert && !isModifier(args[1]);
    const isUserServicesUpdate = isUpdate && _name === "users" && Object.keys(Object.values(args[1])[0])[0].split(".")[0] === "services";

    // If you do have a Meteor.users schema, then this prevents a check on Meteor.users.services updates that run periodically to resume login tokens and other things that don't need validation
    if (isUserServicesUpdate || ["upsert", "upsertAsync"].includes(methodName)) {
      return method.apply(collection, args);
    }

    if (_withDates) {
      extendWithDates(args, { isUpsert, isUpdate, isReplacementUpsert });
    }

    if (_withUser) {
      extendWithUser(args, { isUpsert, isUpdate, isReplacementUpsert });
    }

    const schemaToCheck = isUpdate ? _schema.deepPartial?.() || _schema.partial() : _schema;

    try {
      if (isUpsert) {
        if (isModifier(args[1])) {
          if (args[1].$set) {
            args[1].$set = parseModifierFields(
              args[1].$set,
              _schema,
              _schema.deepPartial?.() || _schema.partial(),
            );
          }

          if (args[1].$setOnInsert) {
            args[1].$setOnInsert = parseModifierFields(args[1].$setOnInsert, _schema, _schema.partial());
          }
        } else {
          args[1] = _schema.parse(normalizeDottedDocument(args[1]));
        }
      } else if (isUpdate) {
        Object.keys(args[1]).forEach((key) => {
          if (key === "$push" || key === "$addToSet") {
            const fields = Object.keys(args[1][key]);

            fields.forEach((field) => {
              const fieldSchema = schemaFromPath(_schema, field);

              checkFieldExists(fieldSchema, field);
              const arraySchema = checkFieldIsArray(fieldSchema, field);
              const elementSchema = arraySchema.element;

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
          } else if (key === "$unset") {
            const fields = Object.keys(args[1][key]);

            fields.forEach((field) => {
              const fieldSchema = schemaFromPath(_schema, field);

              // For nested fields, we need to check if the parent path exists
              const parentPath = field.split(".").slice(0, -1).join(".");
              if (parentPath) {
                const parentSchema = schemaFromPath(_schema, parentPath);
                checkFieldExists(parentSchema, parentPath);
              }

              checkFieldExists(fieldSchema, field);

              // Validate the supported MongoDB $unset marker values
              const unsetSchema = z.object({
                [field]: z.union([z.literal(""), z.literal(true), z.literal(1)]),
              });

              try {
                unsetSchema.parse(args[1][key]);
              } catch {
                throw new ValidationError([{
                  name: field,
                  type: "invalid_unset_value",
                  message: `Invalid $unset value for field "${field}". Value must be "", true, or 1.`,
                }], "Invalid $unset operation");
              }
            });
          } else if (key === "$pullAll") {
            const fields = Object.keys(args[1][key]);

            fields.forEach((field) => {
              const fieldSchema = schemaFromPath(_schema, field);

              // For nested fields, check if parent path exists
              const parentPath = field.split(".").slice(0, -1).join(".");
              if (parentPath) {
                const parentSchema = schemaFromPath(_schema, parentPath);
                checkFieldExists(parentSchema, parentPath);
              }

              checkFieldExists(fieldSchema, field);
              const arraySchema = checkFieldIsArray(fieldSchema, field);

              if (!Array.isArray(args[1][key][field])) {
                throw new ValidationError([{
                  name: field,
                  type: "invalid_pullall_value",
                  message: `Invalid $pullAll value for field "${field}". Value must be an array.`,
                }], "Invalid $pullAll operation");
              }

              try {
                args[1][key][field].forEach((item) => {
                  arraySchema.element.parse(item);
                });
              } catch {
                throw new ValidationError([{
                  name: field,
                  type: "invalid_pullall_criteria",
                  message: `Invalid $pullAll criteria for field "${field}". Each item must match array element schema.`,
                }], "Invalid $pullAll operation");
              }
            });
          } else if (key === "$pull") {
            const fields = Object.keys(args[1][key]);

            fields.forEach((field) => {
              const fieldSchema = schemaFromPath(_schema, field);

              // For nested fields, check if parent path exists
              const parentPath = field.split(".").slice(0, -1).join(".");
              if (parentPath) {
                const parentSchema = schemaFromPath(_schema, parentPath);
                checkFieldExists(parentSchema, parentPath);
              }

              checkFieldExists(fieldSchema, field);
              const arraySchema = checkFieldIsArray(fieldSchema, field);

              try {
                // TODO: Handle $elemMatch operator
                if (args[1][key][field]?.$elemMatch) {
                  return;
                }

                try {
                  if (arraySchema.element instanceof z.ZodObject) {
                    arraySchema.element.partial().parse(args[1][key][field]);
                  } else {
                    arraySchema.element.parse(args[1][key][field]);
                  }
                } catch (e) {
                  if (containsDollarKey(args[1][key][field])) {
                    // TODO: Handle other operators inside $pull
                    return;
                  }

                  throw e;
                }
              } catch {
                throw new ValidationError([{
                  name: field,
                  type: "invalid_pull_criteria",
                  message: `Invalid $pull criteria for field "${field}". Criteria must match array element schema.`,
                }], "Invalid $pull operation");
              }
            });
          } else if (unsupportedOps.includes(key)) {
            // TODO: Support these operations
          } else {
            args[1][key] = parseModifierFields(args[1][key], _schema, schemaToCheck);
          }
        });
      } else {
        args[0] = schemaToCheck.parse(normalizeDottedDocument(args[0]));
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


const transparentWrapperTypes = [
  z.ZodOptional,
  z.ZodDefault,
  z.ZodNullable,
  z.ZodCatch,
  z.ZodReadonly,
].filter(Boolean);

function unwrapForPathTraversal(schema) {
  const visited = new Set();
  let currentSchema = schema;

  while (currentSchema && !visited.has(currentSchema)) {
    visited.add(currentSchema);

    const isTransparentWrapper = transparentWrapperTypes.some(
      wrapperType => currentSchema instanceof wrapperType,
    );

    if (!isTransparentWrapper) {
      break;
    }

    const innerSchema = typeof currentSchema.unwrap === "function"
      ? currentSchema.unwrap()
      : (currentSchema._zod?.def || currentSchema._def)?.innerType;

    if (!innerSchema || innerSchema === currentSchema) {
      break;
    }

    currentSchema = innerSchema;
  }

  return currentSchema;
}

function schemaFromPath(schema, path) {
  const pathSegments = path.split(".");

  // Traverse the schema by following the path segments
  let currentSchema = schema;

  for (const segment of pathSegments) {
    const schemaToTraverse = unwrapForPathTraversal(currentSchema);

    if (schemaToTraverse instanceof z.ZodObject) {
      currentSchema = schemaToTraverse.shape[segment];
    } else if (schemaToTraverse instanceof z.ZodRecord) {
      const keyResult = schemaToTraverse.keyType.safeParse(segment);

      if (!keyResult.success) {
        return undefined;
      }

      currentSchema = schemaToTraverse.valueType;
    } else if (schemaToTraverse instanceof z.ZodArray) {
      const isArrayIndex = segment === "$" || /^\d+$/.test(segment);

      if (isArrayIndex) {
        currentSchema = schemaToTraverse.element;
      } else {
        const elementSchema = unwrapForPathTraversal(schemaToTraverse.element);

        if (!(elementSchema instanceof z.ZodObject)) {
          return undefined;
        }

        currentSchema = elementSchema.shape[segment];
      }
    } else if (
      schemaToTraverse instanceof z.ZodUnknown
      || schemaToTraverse instanceof z.ZodAny
    ) {
      // Unknown and any record values permit arbitrary deeper dotted paths.
      currentSchema = schemaToTraverse;
    } else {
      return undefined; // Path does not exist or is not an object
    }

    if (!currentSchema) {
      return undefined;
    }
  }

  // Keep leaf wrappers so parsing retains their validation semantics.
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
  const schemaToCheck = unwrapForPathTraversal(schema);
  const fieldIsArray = schemaToCheck instanceof z.ZodArray;

  if (!fieldIsArray) {
    throw new ValidationError([{
      name: field,
      type: "invalid_array_field",
      message: `${field} is not a valid array`,
    }], "Invalid array field");
  }

  return schemaToCheck;
}

function validateNestedFields(object, schema) {
  const nestedFields = Object.keys(object).filter((key) => key.includes("."));
  const validNestedFields = {};
  const errors = [];

  nestedFields.forEach((field) => {
    const nestedSchema = schemaFromPath(schema, field);

    if (!nestedSchema) {
      errors.push({
        name: field,
        type: "invalid_field",
        message: `${field} does not exist`,
      });
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

function parseModifierFields(fields, schema, schemaToCheck) {
  const originalFields = Object.assign({}, fields);
  const parsedFields = schemaToCheck.parse(fields);
  const { validNestedFields, errors } = validateNestedFields(fields, schema);

  if (errors.length > 0) {
    throw new ValidationError(errors, "Nested fields validation error");
  }

  const result = Object.assign(parsedFields, validNestedFields);

  Object.keys(result).forEach((field) => {
    if (originalFields[field] === undefined) {
      delete result[field];
    }
  });

  return result;
}

function isModifier(document) {
  return Object.keys(document).some(key => key.startsWith("$"));
}

function normalizeDottedDocument(document) {
  const normalizedDocument = Object.create(null);
  const dottedFields = [];
  const createdContainers = new WeakSet();

  Object.entries(document).forEach(([field, value]) => {
    if (["__proto__", "prototype", "constructor"].includes(field)) {
      throw new ValidationError([{
        name: field,
        type: "invalid_field",
        message: `${field} is not a valid field`,
      }], "Invalid field");
    }

    if (field.includes(".")) {
      dottedFields.push([field, value]);
    } else {
      normalizedDocument[field] = value;
    }
  });

  dottedFields.forEach(([field, value]) => {
    const path = field.split(".");
    let target = normalizedDocument;

    path.forEach((segment, index) => {
      if (!segment || ["__proto__", "prototype", "constructor"].includes(segment)) {
        throw new ValidationError([{
          name: field,
          type: "invalid_field",
          message: `${field} is not a valid nested field`,
        }], "Invalid nested field");
      }

      const isLastSegment = index === path.length - 1;
      const hasSegment = Object.prototype.hasOwnProperty.call(target, segment);

      if (isLastSegment) {
        if (hasSegment) {
          throwNestedFieldConflict(field);
        }

        target[segment] = value;
        return;
      }

      const nextContainer = Number.isInteger(Number(path[index + 1])) ? [] : {};

      if (!hasSegment) {
        target[segment] = nextContainer;
        createdContainers.add(nextContainer);
      } else if (!createdContainers.has(target[segment])) {
        throwNestedFieldConflict(field);
      } else if (Array.isArray(target[segment]) !== Array.isArray(nextContainer)) {
        throwNestedFieldConflict(field);
      }

      target = target[segment];
    });
  });

  return normalizedDocument;
}

function throwNestedFieldConflict(field) {
  throw new ValidationError([{
    name: field,
    type: "conflicting_field",
    message: `${field} conflicts with another field in the document`,
  }], "Conflicting nested fields");
}

function containsDollarKey(obj) {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }

  for (const key in obj) {
    if (key.startsWith("$")) {
      return true;
    }

    const value = obj[key];
    if (typeof value === "object" && containsDollarKey(value)) {
      return true;
    }
  }

  return false;
}
