import { z } from "zod";
import { Mongo } from "meteor/mongo";
import { Random } from "meteor/random";
import { Tinytest } from "meteor/tinytest";

import { ValidationError } from "../src/ValidationError";
import "./types";


// Helper function to create a test collection
const createTestCollection = (name, noMiniMongo = false) => {
  const collection = new Mongo.Collection(noMiniMongo ? name : null);
  collection._name = name;
  return collection;
};

const UsersCollection = createTestCollection("users", true);


Tinytest.add("extendWithSchema - withSchema", (test) => {
  const TestCollection = createTestCollection("test");
  const schema = z.object({
    name: z.string(),
    age: z.number(),
  });

  TestCollection.withSchema(schema);

  test.equal(TestCollection._schema, schema, "Schema should be set correctly");
  test.isTrue(TestCollection._schema.shape.isDeleted === undefined, "isDeleted should not be added to schema");
  test.isTrue(TestCollection._schema.shape.createdAt === undefined, "createdAt should not be added to schema");
  test.isTrue(TestCollection._schema.shape.updatedAt === undefined, "updatedAt should not be added to schema");
});

Tinytest.add("extendWithSchema - withDates", (test) => {
  const TestCollection = createTestCollection("test");
  const schema = z.object({
    name: z.string(),
  });

  TestCollection.withSchema(schema).withDates();

  test.isTrue(TestCollection._withDates, "withDates flag should be set");
  test.isTrue(TestCollection._schema.shape.isDeleted === undefined, "isDeleted should not be added to schema");
  test.isTrue(TestCollection._schema.shape.createdAt instanceof z.ZodType, "createdAt should be added to schema");
  test.isTrue(TestCollection._schema.shape.updatedAt instanceof z.ZodType, "updatedAt should be added to schema");
});

Tinytest.add("extendWithSchema - withSoftDelete", (test) => {
  const TestCollection = createTestCollection("test");
  const schema = z.object({
    name: z.string(),
  });

  TestCollection.withSchema(schema).withSoftDelete();

  test.isTrue(TestCollection._softDelete, "softDelete flag should be set");
  test.isTrue(TestCollection._schema.shape.isDeleted instanceof z.ZodType, "isDeleted should be added to schema");
  test.isTrue(TestCollection._schema.shape.deletedAt instanceof z.ZodType, "deletedAt should be added to schema");
  test.isTrue(TestCollection._schema.shape.createdAt === undefined, "createdAt should not be added to schema");
  test.isTrue(TestCollection._schema.shape.updatedAt === undefined, "updatedAt should not be added to schema");
});

Tinytest.addAsync("extendWithSchema - insertAsync with schema validation", async (test) => {
  const TestCollection = createTestCollection("test");
  const schema = z.object({
    name: z.string(),
    age: z.number(),
  });

  TestCollection.withSchema(schema);

  await TestCollection.insertAsync({ name: "John", age: 30, otherField: "miaw" });

  const doc = await TestCollection.findOneAsync();

  test.equal(doc.name, "John", "Document should be inserted correctly");
  test.equal(doc.age, 30, "Document should be inserted correctly");
  test.isUndefined(doc.otherField, "otherField should not be inserted");

  try {
    await TestCollection.insertAsync({ name: "Invalid", age: "Not a number" });

    test.fail("Should throw an error for invalid data");
  } catch (error) {
    test.isTrue(error.message.includes("Collection schema validation error"), "Should throw a validation error");
  }
});

Tinytest.addAsync("extendWithSchema - insertAsync with dot notation", async (test) => {
  const TestCollection = createTestCollection(`dotInsert-${Random.id()}`, true);
  const schema = z.object({
    name: z.string(),
    meta: z.object({
      views: z.number(),
    }),
  });

  TestCollection.withSchema(schema);

  const docId = await TestCollection.insertAsync({ name: "John", "meta.views": 1 });
  const doc = await TestCollection.findOneAsync(docId);

  test.equal(doc.meta.views, 1, "Dotted field should be stored as a nested value");
  test.isUndefined(doc["meta.views"], "Dotted field should not be stored literally");

  try {
    await TestCollection.insertAsync({ name: "Invalid", "meta.views": "not a number" });
    test.fail("Should reject an invalid dotted field value");
  } catch (error) {
    test.isTrue(ValidationError.is(error), "Error should be a ValidationError");
    test.equal(error.details[0].name, "meta.views", "Error should include the full dotted path");
  }

  try {
    await TestCollection.insertAsync({ name: "Conflict", meta: { views: 1 }, "meta.views": 2 });
    test.fail("Should reject conflicting nested field representations");
  } catch (error) {
    test.isTrue(ValidationError.is(error), "Error should be a ValidationError");
    test.equal(error.details[0].name, "meta.views", "Error should identify the conflicting dotted path");
    test.equal(error.details[0].type, "conflicting_field", "Error should identify a field conflict");
  }
});

Tinytest.addAsync("extendWithSchema - updateAsync with schema validation", async (test) => {
  const TestCollection = createTestCollection("test");
  const schema = z.object({
    name: z.string(),
    age: z.number(),
  });

  TestCollection.withSchema(schema);

  const id = await TestCollection.insertAsync({ name: "John", age: 30 });

  await TestCollection.updateAsync(id, { $set: { age: 31 } });
  const updatedDoc = await TestCollection.findOneAsync(id);
  test.equal(updatedDoc.age, 31, "Document should be updated correctly");

  try {
    await TestCollection.updateAsync(id, { $set: { age: "Not a number" } });
    test.fail("Should throw an error for invalid data");
  } catch (error) {
    test.isTrue(error.message.includes("Collection schema validation error"), "Should throw a validation error");
  }
});

Tinytest.addAsync("extendWithSchema - updateAsync with dot notation", async (test) => {
  const TestCollection = createTestCollection(`dotUpdate-${Random.id()}`, true);
  const schema = z.object({
    name: z.string(),
    meta: z.object({
      views: z.number(),
      messages: z.number(),
    }),
  });

  TestCollection.withSchema(schema);

  const docId = await TestCollection.insertAsync({ name: "John", meta: { views: 1, messages: 3 } });

  await TestCollection.updateAsync(docId, { $set: { "meta.views": 2 } });

  const doc = await TestCollection.findOneAsync(docId);
  test.equal(doc.meta.views, 2, "Dotted field should update the nested value");
  test.equal(doc.meta.messages, 3, "Other notted fields should be unchanged");
  test.isUndefined(doc["meta.views"], "Dotted field should not be stored literally");

  try {
    await TestCollection.updateAsync(docId, { $set: { "meta.views": "not a number" } });
    test.fail("Should reject an invalid dotted update value");
  } catch (error) {
    test.isTrue(ValidationError.is(error), "Error should be a ValidationError");
    test.equal(error.details[0].name, "meta.views", "Error should include the full dotted path");
  }
});

Tinytest.addAsync("extendWithSchema - dotted updates through nested wrappers", async (test) => {
  const TestCollection = createTestCollection(`wrappedDotUpdate-${Random.id()}`, true);
  const checklistSchema = z.object({
    training: z.boolean().default(false),
  });
  const schema = z.object({
    optionalDefault: checklistSchema.default({ training: false }).optional(),
    defaultOptional: checklistSchema.optional().default({ training: false }),
    defaulted: checklistSchema.default({ training: false }),
    optional: checklistSchema.optional(),
    nullable: checklistSchema.nullable().optional(),
    caught: checklistSchema.catch({ training: false }).optional(),
    readonly: checklistSchema.readonly().optional(),
  });

  TestCollection.withSchema(schema);

  const docId = await TestCollection.insertAsync({});
  const wrappedFields = [
    "optionalDefault",
    "defaultOptional",
    "defaulted",
    "optional",
    "nullable",
    "caught",
    "readonly",
  ];

  for (const field of wrappedFields) {
    await TestCollection.updateAsync(docId, {
      $set: { [`${field}.training`]: true },
    });
  }

  const doc = await TestCollection.findOneAsync(docId);

  wrappedFields.forEach((field) => {
    test.isTrue(doc[field].training, `${field} should allow a dotted update`);
  });

  try {
    await TestCollection.updateAsync(docId, {
      $set: { "optionalDefault.training": "yes" },
    });
    test.fail("Should reject an invalid value through nested wrappers");
  } catch (error) {
    test.isTrue(ValidationError.is(error), "Error should be a ValidationError");
    test.equal(error.details[0].name, "optionalDefault.training", "Error should include the full dotted path");
  }

  const invalidModifier = {
    $set: { "optionalDefault.unknown": true },
  };

  try {
    await TestCollection.updateAsync(docId, invalidModifier);
    test.fail("Should reject an unknown dotted path");
  } catch (error) {
    test.isTrue(ValidationError.is(error), "Error should be a ValidationError");
    test.equal(error.details[0].name, "optionalDefault.unknown", "Error should identify the unknown dotted path");
    test.equal(error.details[0].type, "invalid_field", "Error should report an invalid field");
  }

  test.isTrue(
    Object.prototype.hasOwnProperty.call(invalidModifier.$set, "optionalDefault.unknown"),
    "Invalid dotted paths should not be removed from the modifier",
  );
});

Tinytest.addAsync("extendWithSchema - multi-level dotted validation", async (test) => {
  const assemblySchema = z.object({
    general: z.number(),
  });
  const wrappedAssemblySchema = assemblySchema
    .readonly()
    .optional()
    .default({ general: 0 });
  const plainRatingsSchema = z.object({
    assembly: assemblySchema,
  });
  const wrappedInnerRatingsSchema = z.object({
    assembly: wrappedAssemblySchema,
  });
  const schemaVariants = [
    {
      name: "plain",
      schema: z.object({ ratings: plainRatingsSchema }),
    },
    {
      name: "wrapped",
      schema: z.object({
        ratings: wrappedInnerRatingsSchema
          .readonly()
          .optional()
          .default({ assembly: { general: 0 } }),
      }),
    },
    {
      name: "wrapped-outer",
      schema: z.object({
        ratings: plainRatingsSchema
          .readonly()
          .optional()
          .default({ assembly: { general: 0 } }),
      }),
    },
    {
      name: "wrapped-inner",
      schema: z.object({ ratings: wrappedInnerRatingsSchema }),
    },
  ];

  for (const { name, schema } of schemaVariants) {
    const TestCollection = createTestCollection(`multiLevelDot-${name}-${Random.id()}`, true);

    TestCollection.withSchema(schema);

    const docId = await TestCollection.insertAsync({
      "ratings.assembly.general": 5,
    });
    let doc = await TestCollection.findOneAsync(docId);

    test.equal(doc.ratings.assembly.general, 5, `${name} dotted insert should store a nested value`);
    test.isUndefined(
      doc["ratings.assembly.general"],
      `${name} dotted insert should not store the literal dotted field`,
    );

    await TestCollection.updateAsync(docId, {
      $set: { "ratings.assembly.general": 6 },
    });
    doc = await TestCollection.findOneAsync(docId);

    test.equal(doc.ratings.assembly.general, 6, `${name} dotted update should store a nested value`);

    try {
      await TestCollection.insertAsync({
        "ratings.assembly.general": "not a number",
      });
      test.fail(`${name} should reject an invalid dotted insert value`);
    } catch (error) {
      test.isTrue(ValidationError.is(error), `${name} insert error should be a ValidationError`);
      test.equal(
        error.details[0].name,
        "ratings.assembly.general",
        `${name} insert error should include the full dotted path`,
      );
    }

    try {
      await TestCollection.updateAsync(docId, {
        $set: { "ratings.assembly.general": "not a number" },
      });
      test.fail(`${name} should reject an invalid dotted update value`);
    } catch (error) {
      test.isTrue(ValidationError.is(error), `${name} update error should be a ValidationError`);
      test.equal(
        error.details[0].name,
        "ratings.assembly.general",
        `${name} update error should include the full dotted path`,
      );
    }

    try {
      await TestCollection.updateAsync(docId, {
        $set: { "ratings.assembly.unknown": 7 },
      });
      test.fail(`${name} should reject an unknown dotted path`);
    } catch (error) {
      test.isTrue(ValidationError.is(error), `${name} unknown-path error should be a ValidationError`);
      test.equal(
        error.details[0].name,
        "ratings.assembly.unknown",
        `${name} unknown-path error should include the full dotted path`,
      );
      test.equal(error.details[0].type, "invalid_field", `${name} should report an invalid field`);
    }
  }
});

Tinytest.addAsync("extendWithSchema - nested record validation", async (test) => {
  const insertCollection = createTestCollection(`recordInsert-${Random.id()}`, true);
  const updateCollection = createTestCollection(`recordUpdate-${Random.id()}`, true);
  const upsertCollection = createTestCollection(`recordUpsert-${Random.id()}`, true);
  const schema = z.object({
    type: z.literal("ASSEMBLY_ASSISTANT"),
    assemblyAssistantId: z.string(),
    ratings: z.record(z.string(), z.unknown()),
  });

  insertCollection.withSchema(schema);
  updateCollection.withSchema(schema);
  upsertCollection.withSchema(schema);

  const insertId = await insertCollection.insertAsync({
    type: "ASSEMBLY_ASSISTANT",
    assemblyAssistantId: "insert-assistant",
    ratings: { assembly: { general: 3 } },
  });
  const insertedDoc = await insertCollection.findOneAsync(insertId);

  test.equal(insertedDoc.ratings.assembly.general, 3, "Insert should store a nested record value");

  const dottedInsertId = await insertCollection.insertAsync({
    type: "ASSEMBLY_ASSISTANT",
    assemblyAssistantId: "dotted-insert-assistant",
    "ratings.assembly.general": 4,
  });
  const dottedInsertedDoc = await insertCollection.findOneAsync(dottedInsertId);

  test.equal(
    dottedInsertedDoc.ratings.assembly.general,
    4,
    "Dotted insert should work through an unknown record value",
  );
  test.isUndefined(
    dottedInsertedDoc["ratings.assembly.general"],
    "Dotted record fields should not be stored literally",
  );

  const updateId = await updateCollection.insertAsync({
    type: "ASSEMBLY_ASSISTANT",
    assemblyAssistantId: "update-assistant",
    ratings: { assembly: { general: 3 } },
  });

  await updateCollection.updateAsync(updateId, {
    $set: {
      ratings: { assembly: { general: 4 } },
    },
  });

  let updatedDoc = await updateCollection.findOneAsync(updateId);

  test.equal(updatedDoc.ratings.assembly.general, 4, "Update should store a nested record value");

  await updateCollection.updateAsync(updateId, {
    $set: {
      "ratings.assembly.general": 5,
    },
  });

  updatedDoc = await updateCollection.findOneAsync(updateId);

  test.equal(updatedDoc.ratings.assembly.general, 5, "Dotted update should work through an unknown record value");

  const upsertResult = await upsertCollection.upsertAsync(
    { type: "ASSEMBLY_ASSISTANT", assemblyAssistantId: "upsert-assistant" },
    {
      $set: {
        ratings: { assembly: { general: 6 } },
      },
    },
  );
  let upsertedDoc = await upsertCollection.findOneAsync(upsertResult.insertedId);

  test.equal(upsertedDoc.ratings.assembly.general, 6, "Upsert should insert a nested record value");

  await upsertCollection.upsertAsync(
    { type: "ASSEMBLY_ASSISTANT", assemblyAssistantId: "upsert-assistant" },
    {
      $set: {
        ratings: { assembly: { general: 7 } },
      },
    },
  );
  upsertedDoc = await upsertCollection.findOneAsync(upsertResult.insertedId);

  test.equal(upsertedDoc.ratings.assembly.general, 7, "Upsert should update a nested record value");
});

Tinytest.addAsync("extendWithSchema - typed nested record validation", async (test) => {
  const TestCollection = createTestCollection(`typedRecordUpdate-${Random.id()}`, true);
  const schema = z.object({
    ratings: z.record(z.string(), z.object({
      general: z.number(),
    })),
  });

  TestCollection.withSchema(schema);

  const docId = await TestCollection.insertAsync({
    ratings: { assembly: { general: 3 } },
  });

  await TestCollection.updateAsync(docId, {
    $set: { "ratings.assembly.general": 4 },
  });

  try {
    await TestCollection.updateAsync(docId, {
      $set: { "ratings.assembly.general": "not a number" },
    });
    test.fail("Should reject an invalid typed record value");
  } catch (error) {
    test.isTrue(ValidationError.is(error), "Typed record error should be a ValidationError");
    test.equal(
      error.details[0].name,
      "ratings.assembly.general",
      "Typed record error should include the full dotted path",
    );
  }
});

Tinytest.addAsync("extendWithSchema - dotted updates through wrapped object arrays", async (test) => {
  const TestCollection = createTestCollection(`wrappedArrayDotUpdate-${Random.id()}`, true);
  const schema = z.object({
    items: z.array(z.object({
      key: z.string(),
      enabled: z.boolean(),
    })).default([]).optional(),
  });

  TestCollection.withSchema(schema);

  const docId = await TestCollection.insertAsync({
    items: [
      { key: "first", enabled: false },
      { key: "second", enabled: false },
    ],
  });

  await TestCollection.updateAsync(docId, {
    $set: { "items.0.enabled": true },
  });
  await TestCollection.updateAsync(
    { _id: docId, "items.key": "second" },
    { $set: { "items.$.enabled": true } },
  );

  const doc = await TestCollection.findOneAsync(docId);

  test.isTrue(doc.items[0].enabled, "Numeric array paths should update through wrappers");
  test.isTrue(doc.items[1].enabled, "Positional array paths should update through wrappers");
});

Tinytest.addAsync("extendWithSchema - removeAsync", async (test) => {
  const TestCollection = createTestCollection("test");
  const schema = z.object({
    name: z.string(),
  });

  TestCollection.withSchema(schema);

  const id = await TestCollection.insertAsync({ name: "John" });
  test.isNotUndefined(id, "Doc should be inserted");

  await TestCollection.removeAsync(id);

  const doc = await TestCollection.findOneAsync(id);
  test.isUndefined(doc, "Doc should be removed");
});

Tinytest.addAsync("extendWithSchema - removeAsync with soft delete", async (test) => {
  const TestCollection = createTestCollection("test");
  const schema = z.object({
    name: z.string(),
  });

  TestCollection.withSchema(schema).withSoftDelete();

  const id = await TestCollection.insertAsync({ name: "John" });

  await TestCollection.removeAsync(id);
  const doc = await TestCollection.findOneAsync(id);
  test.isTrue(doc.isDeleted, "Document should be soft deleted");
  test.isNotUndefined(doc.deletedAt, "deletedAt should be set");
});

Tinytest.addAsync("extendWithSchema - recoverAsync withSoftDelete", async (test) => {
  const TestCollection = createTestCollection("test");
  const schema = z.object({
    name: z.string(),
  });

  TestCollection.withSchema(schema).withSoftDelete();

  const id = await TestCollection.insertAsync({ name: "John" });

  await TestCollection.removeAsync(id);
  const softDeletedDoc = await TestCollection.findOneAsync(id);

  test.isNotNull(softDeletedDoc, "Document should still exist after soft delete");
  test.isTrue(softDeletedDoc.isDeleted, "Document should be marked as deleted");
  test.isNotUndefined(softDeletedDoc.deletedAt, "deletedAt should be set");

  await TestCollection.recoverAsync(id);
  const recoveredDoc = await TestCollection.findOneAsync(id);

  test.isFalse(recoveredDoc.isDeleted, "Document should no longer be marked as deleted");
  test.isUndefined(recoveredDoc.deletedAt, "deletedAt should be unset");
});

Tinytest.addAsync("extendWithSchema - insertAsync withDates", async (test) => {
  const TestCollection = createTestCollection("test");
  const schema = z.object({
    name: z.string(),
  });

  TestCollection.withSchema(schema).withDates();

  const id = await TestCollection.insertAsync({ name: "John" });
  const doc = await TestCollection.findOneAsync(id);

  test.isNotUndefined(doc.createdAt, "createdAt should be set");
  test.isNotUndefined(doc.updatedAt, "updatedAt should be set");
  test.isTrue(doc.createdAt instanceof Date, "createdAt should be a Date");
  test.isTrue(doc.updatedAt instanceof Date, "updatedAt should be a Date");
});

Tinytest.addAsync("extendWithSchema - updateAsync with withDates", async (test) => {
  const TestCollection = createTestCollection("test");
  const schema = z.object({
    name: z.string(),
  });

  TestCollection.withSchema(schema).withDates();

  const id = await TestCollection.insertAsync({ name: "John" });
  const originalDoc = await TestCollection.findOneAsync(id);

  await new Promise(resolve => setTimeout(resolve, 50));

  await TestCollection.updateAsync(id, { $set: { name: "Jane" } });
  const updatedDoc = await TestCollection.findOneAsync(id);

  test.equal(updatedDoc.name, "Jane", "Name should be updated");
  test.equal(updatedDoc.createdAt.getTime(), originalDoc.createdAt.getTime(), "createdAt should not change");
  test.isTrue(updatedDoc.updatedAt > originalDoc.updatedAt, "updatedAt should be later than original");
});

Tinytest.addAsync("extendWithSchema - schema validation", async (test) => {
  const TestCollection = createTestCollection("test");
  const schema = z.object({
    name: z.string(),
    age: z.number().positive(),
  });

  TestCollection.withSchema(schema);

  try {
    await TestCollection.insertAsync({ name: "John", age: -5 });
    test.fail("Should throw ValidationError for negative age");
  } catch (error) {
    test.isTrue(ValidationError.is(error), "Error should be a ValidationError");
    test.equal(error.details[0].name, "age", "Error should be about the age field");
  }

  try {
    await TestCollection.insertAsync({ name: "John", age: "30" });
    test.fail("Should throw ValidationError for string age");
  } catch (error) {
    test.isTrue(ValidationError.is(error), "Error should be a ValidationError");
    test.equal(error.details[0].name, "age", "Error should be about the age field");
  }

  const id = await TestCollection.insertAsync({ name: "John", age: 30 });
  test.isNotUndefined(id, "Valid document should be inserted");
});

Tinytest.addAsync("extendWithSchema - schema validation with nested fields", async (test) => {
  const TestCollection = createTestCollection("nestedTest", true);
  const schema = z.object({
    name: z.string(),
    profile: z.object({
      age: z.number().positive(),
      address: z.object({
        city: z.string(),
        country: z.string(),
      }),
    }),
  });

  TestCollection.withSchema(schema);

  try {
    await TestCollection.insertAsync({ name: "John", profile: { age: -1, address: { city: "Barcelona", country: "Spain" } } });
    test.fail("Should throw ValidationError for negative age");
  } catch (error) {
    test.isTrue(ValidationError.is(error), "Error should be a ValidationError");
    test.equal(error.details[0].name, "profile.age", "Error should be about the age field");
  }

  const docId = await TestCollection.insertAsync({ name: "John", profile: { age: 21, address: { city: "Barcelona", country: "Spain" } } });
  let doc = await TestCollection.findOneAsync(docId);
  test.equal(doc.profile.age, 21, "Age should be set correctly");
  test.equal(doc.profile.address.city, "Barcelona", "City should be set correctly");
  test.equal(doc.profile.address.country, "Spain", "Country should be set correctly");

  await TestCollection.updateAsync(docId, { $set: { "profile.age": 22 } });
  doc = await TestCollection.findOneAsync(docId);
  test.equal(doc.profile.age, 22, "Age should be updated correctly");

  await TestCollection.updateAsync(docId, { $set: { "profile.address.city": "Madrid" } });
  doc = await TestCollection.findOneAsync(docId);
  test.equal(doc.profile.address.city, "Madrid", "City should be updated correctly. Madrid, really?");
  test.equal(doc.profile.address.country, "Spain", "Country should not be updated");

  try {
    await TestCollection.updateAsync(docId, { $set: { "profile.address.miaw": "Madrid" } });
    test.fail("Should reject an unknown dotted path");
  } catch (error) {
    test.isTrue(ValidationError.is(error), "Error should be a ValidationError");
    test.equal(error.details[0].name, "profile.address.miaw", "Error should identify the unknown dotted path");
    test.equal(error.details[0].type, "invalid_field", "Error should report an invalid field");
  }

  doc = await TestCollection.findOneAsync(docId);
  test.isUndefined(doc.profile.address.miaw, "Miaw should not be set");

  try {
    await TestCollection.updateAsync(docId, { $set: { "profile.address.city": 123, "profile.age": -21 } });
    test.fail("Should throw ValidationError");
  } catch (error) {
    test.isTrue(ValidationError.is(error), "Error should be a ValidationError");
    test.equal(error.details?.[0]?.name, "profile.address.city", "Error should be about the city field");
    test.equal(error.details?.[1]?.name, "profile.age", "Error should be about the age field");
  }
});



Tinytest.addAsync("extendWithSchema - upsert with withDates", async (test) => {
  const TestCollection = createTestCollection("test");
  const schema = z.object({
    name: z.string(),
    count: z.number(),
  });

  TestCollection.withSchema(schema).withDates();

  const result = await TestCollection.upsertAsync(
    { name: "John" },
    { $set: { name: "Johny" }, $setOnInsert: { count: 1 } },
  );

  const doc = await TestCollection.findOneAsync(result.insertedId);

  test.isNotUndefined(doc, "Document should be inserted");
  test.equal(doc.name, "Johny", "Name should be set correctly");
  test.equal(doc.count, 1, "Count should be set correctly");
  test.isNotUndefined(doc.createdAt, "createdAt should be set");
  test.isNotUndefined(doc.updatedAt, "updatedAt should be set");

  await new Promise(resolve => setTimeout(resolve, 50));

  await TestCollection.upsertAsync(
    { name: "Johny" },
    { $set: { count: 2 }, $setOnInsert: { count: 1 } },
  );

  const updatedDoc = await TestCollection.findOneAsync(result.insertedId);

  test.equal(updatedDoc.count, 2, "Count should be updated");
  test.equal(updatedDoc.createdAt.getTime(), doc.createdAt.getTime(), "createdAt should not change");
  test.isTrue(updatedDoc.updatedAt > doc.updatedAt, "updatedAt should be later than original");
});

Tinytest.addAsync("extendWithSchema - upsert with dot notation", async (test) => {
  const directUpsertCollection = createTestCollection(`dotDirectUpsert-${Random.id()}`, true);
  const updateUpsertCollection = createTestCollection(`dotUpdateUpsert-${Random.id()}`, true);
  const replacementUpsertCollection = createTestCollection(`dotReplacementUpsert-${Random.id()}`, true);
  const schema = z.object({
    name: z.string(),
    meta: z.object({
      views: z.number(),
      clicks: z.number(),
    }),
  });

  directUpsertCollection.withSchema(schema);
  updateUpsertCollection.withSchema(schema);
  replacementUpsertCollection.withSchema(schema);

  const directResult = await directUpsertCollection.upsertAsync(
    { name: "Direct" },
    { $set: { "meta.views": 1 }, $setOnInsert: { "meta.clicks": 2 } },
  );
  const directDoc = await directUpsertCollection.findOneAsync(directResult.insertedId);

  test.equal(directDoc.meta, { views: 1, clicks: 2 }, "Direct upsert should preserve modifier dot notation");

  await updateUpsertCollection.updateAsync(
    { name: "Update" },
    { $set: { "meta.views": 3 }, $setOnInsert: { "meta.clicks": 4 } },
    { upsert: true },
  );
  const updateDoc = await updateUpsertCollection.findOneAsync({ name: "Update" });

  test.equal(updateDoc.meta, { views: 3, clicks: 4 }, "Update with upsert should preserve modifier dot notation");

  const replacementResult = await replacementUpsertCollection.upsertAsync(
    { name: "Replacement" },
    { name: "Replacement", "meta.views": 5, "meta.clicks": 6 },
  );
  const replacementDoc = await replacementUpsertCollection.findOneAsync(replacementResult.insertedId);

  test.equal(replacementDoc.meta, { views: 5, clicks: 6 }, "Replacement upsert should store nested fields");

  try {
    await directUpsertCollection.upsertAsync(
      { name: "Invalid" },
      { $set: { "meta.views": "not a number" }, $setOnInsert: { "meta.clicks": 7 } },
    );
    test.fail("Should reject an invalid dotted upsert value");
  } catch (error) {
    test.isTrue(ValidationError.is(error), "Error should be a ValidationError");
    test.equal(error.details[0].name, "meta.views", "Error should include the full dotted path");
  }
});

Tinytest.addAsync("extendWithSchema - array operations", async (test) => {
  const TestCollection = createTestCollection("test");
  const schema = z.object({
    name: z.string(),
    tags: z.array(z.string()),
  });

  TestCollection.withSchema(schema);

  const id = await TestCollection.insertAsync({ name: "John", tags: ["tag1", "tag2"] });

  await TestCollection.updateAsync(id, { $push: { tags: "tag3" } });
  let doc = await TestCollection.findOneAsync(id);
  test.equal(doc.tags, ["tag1", "tag2", "tag3"], "Tag should be pushed to array");

  await TestCollection.updateAsync(id, { $pull: { tags: "tag2" } });
  doc = await TestCollection.findOneAsync(id);
  test.equal(doc.tags, ["tag1", "tag3"], "Tag should be pulled from array");

  try {
    await TestCollection.updateAsync(id, { $push: { name: "invalid" } });
    test.fail("Should throw ValidationError for invalid array operation");
  } catch (error) {
    test.isTrue(ValidationError.is(error), "Error should be a ValidationError");
    test.equal(error.details[0].type, "invalid_array_field", "Error should be about invalid array field");
  }

  try {
    await TestCollection.updateAsync(id, { $push: { tags: 1 } });
    test.fail("Should throw ValidationError for invalid array operation");
  } catch (error) {
    test.isTrue(ValidationError.is(error), "Error should be a ValidationError");
    test.equal(error.details[0].type, "invalid_type", "Error should be about invalid type");
  }
});

Tinytest.addAsync("extendWithSchema - array operations with inner object", async (test) => {
  const schema = z.object({
    name: z.string(),
    tags: z.array(z.object({
      name: z.string(),
    })),
  });

  UsersCollection.withSchema(schema);

  const id = await UsersCollection.insertAsync({ name: "John", tags: [{ name: "tag1", miaw: "miaw" }] });
  let doc = await UsersCollection.findOneAsync(id);
  test.equal(doc.tags, [{ name: "tag1" }], "Tag should be pushed to array without miaw field");

  try {
    await UsersCollection.updateAsync(id, { $push: { tags: { miaw: "miaw" } } });
    test.fail("Should throw ValidationError for invalid array operation");
  } catch (error) {
    test.isTrue(ValidationError.is(error), "Error should be a ValidationError");
    test.equal(error.details[0].type, "invalid_type", "Error should be about invalid type");
  }

  await UsersCollection.updateAsync(id, { $push: { tags: { name: "tag2", miaw: "miaw" } } });
  doc = await UsersCollection.findOneAsync(id);
  test.equal(doc.tags, [{ name: "tag1" }, { name: "tag2" }], "Tag should be pushed to array without miaw field");

  await UsersCollection.updateAsync(id, { $pull: { tags: { name: "tag2" } } });
  doc = await UsersCollection.findOneAsync(id);
  test.equal(doc.tags, [{ name: "tag1" }], "Tag2 should be pulled from array");

  await UsersCollection.updateAsync(id, { $push: { tags: { $each: [{ name: "tag2", miaw: "miaw" }, { name: "tag3", miaw: "miaw" }] } } });
  doc = await UsersCollection.findOneAsync(id);
  test.equal(doc.tags, [{ name: "tag1" }, { name: "tag2" }, { name: "tag3" }], "Tags should be pushed to array without miaw field");

  await UsersCollection.updateAsync(id, { $push: { tags: { $each: [{ name: "tag4" }, { name: "tag5" }], $sort: -1 } } });
  doc = await UsersCollection.findOneAsync(id);
  test.equal(doc.tags, [{ name: "tag5" }, { name: "tag4" }, { name: "tag3" }, { name: "tag2" }, { name: "tag1" }], "Tags should be pushed to array in correct order");

  await UsersCollection.updateAsync(id, { $push: { tags: { $each: [{ name: "tag6" }, { name: "tag7" }], $slice: 3, $sort: -1 } } });
  doc = await UsersCollection.findOneAsync(id);
  test.equal(doc.tags, [{ name: "tag7" }, { name: "tag6" }, { name: "tag5" }], "Tags should be limited to the last 3 elements after pushing new tags");

  await UsersCollection.updateAsync(id, { $push: { tags: { $each: [{ name: "tag8" }, { name: "tag9" }], $position: 2 } } });
  doc = await UsersCollection.findOneAsync(id);
  test.equal(doc.tags, [{ name: "tag7" }, { name: "tag6" }, { name: "tag8" }, { name: "tag9" }, { name: "tag5" }], "Tags should include tag8 and tag9 after pushing with $each in position 2");

  await UsersCollection.removeAsync({}, { multi: true });
});

Tinytest.addAsync("extendWithSchema - array operations with optional object array", async (test) => {
  const schema = z.object({
    name: z.string(),
    tags: z
      .object({
        name: z.string(),
      })
      .array()
      .optional(),
  });

  UsersCollection.withSchema(schema);

  const id = await UsersCollection.insertAsync({ name: "John", tags: [{ name: "tag1", miaw: "miaw" }] });
  let doc = await UsersCollection.findOneAsync(id);
  test.equal(doc.tags, [{ name: "tag1" }], "Tag should be pushed to array without miaw field");

  try {
    await UsersCollection.updateAsync(id, { $push: { tags: { miaw: "miaw" } } });
    test.fail("Should throw ValidationError for invalid array operation");
  } catch (error) {
    test.isTrue(ValidationError.is(error), "Error should be a ValidationError");
    test.equal(error.details[0].type, "invalid_type", "Error should be about invalid type");
  }

  await UsersCollection.updateAsync(id, { $push: { tags: { name: "tag2", miaw: "miaw" } } });
  doc = await UsersCollection.findOneAsync(id);
  test.equal(doc.tags, [{ name: "tag1" }, { name: "tag2" }], "Tag should be pushed to array without miaw field");

  await UsersCollection.updateAsync(id, { $pull: { tags: { name: "tag2" } } });
  doc = await UsersCollection.findOneAsync(id);
  test.equal(doc.tags, [{ name: "tag1" }], "Tag2 should be pulled from array");

  await UsersCollection.updateAsync(id, { $push: { tags: { $each: [{ name: "tag2", miaw: "miaw" }, { name: "tag3", miaw: "miaw" }] } } });
  doc = await UsersCollection.findOneAsync(id);
  test.equal(doc.tags, [{ name: "tag1" }, { name: "tag2" }, { name: "tag3" }], "Tags should be pushed to array without miaw field");

  await UsersCollection.updateAsync(id, { $push: { tags: { $each: [{ name: "tag4" }, { name: "tag5" }], $sort: -1 } } });
  doc = await UsersCollection.findOneAsync(id);
  test.equal(doc.tags, [{ name: "tag5" }, { name: "tag4" }, { name: "tag3" }, { name: "tag2" }, { name: "tag1" }], "Tags should be pushed to array in correct order");

  await UsersCollection.updateAsync(id, { $push: { tags: { $each: [{ name: "tag6" }, { name: "tag7" }], $slice: 3, $sort: -1 } } });
  doc = await UsersCollection.findOneAsync(id);
  test.equal(doc.tags, [{ name: "tag7" }, { name: "tag6" }, { name: "tag5" }], "Tags should be limited to the last 3 elements after pushing new tags");

  await UsersCollection.updateAsync(id, { $push: { tags: { $each: [{ name: "tag8" }, { name: "tag9" }], $position: 2 } } });
  doc = await UsersCollection.findOneAsync(id);
  test.equal(doc.tags, [{ name: "tag7" }, { name: "tag6" }, { name: "tag8" }, { name: "tag9" }, { name: "tag5" }], "Tags should include tag8 and tag9 after pushing with $each in position 2");

  await UsersCollection.removeAsync({}, { multi: true });
});

Tinytest.addAsync("extendWithSchema - array operations with optional object array 2", async (test) => {
  const schema = z.object({
    name: z.string(),
    tags: z
      .array(z.object({
        name: z.string(),
      }))
      .optional(),
  });

  UsersCollection.withSchema(schema);

  const id = await UsersCollection.insertAsync({ name: "John", tags: [{ name: "tag1", miaw: "miaw" }] });
  let doc = await UsersCollection.findOneAsync(id);
  test.equal(doc.tags, [{ name: "tag1" }], "Tag should be pushed to array without miaw field");

  try {
    await UsersCollection.updateAsync(id, { $push: { tags: { miaw: "miaw" } } });
    test.fail("Should throw ValidationError for invalid array operation");
  } catch (error) {
    test.isTrue(ValidationError.is(error), "Error should be a ValidationError");
    test.equal(error.details[0].type, "invalid_type", "Error should be about invalid type");
  }

  await UsersCollection.updateAsync(id, { $push: { tags: { name: "tag2", miaw: "miaw" } } });
  doc = await UsersCollection.findOneAsync(id);
  test.equal(doc.tags, [{ name: "tag1" }, { name: "tag2" }], "Tag should be pushed to array without miaw field");

  await UsersCollection.updateAsync(id, { $pull: { tags: { name: "tag2" } } });
  doc = await UsersCollection.findOneAsync(id);
  test.equal(doc.tags, [{ name: "tag1" }], "Tag2 should be pulled from array");

  await UsersCollection.updateAsync(id, { $push: { tags: { $each: [{ name: "tag2", miaw: "miaw" }, { name: "tag3", miaw: "miaw" }] } } });
  doc = await UsersCollection.findOneAsync(id);
  test.equal(doc.tags, [{ name: "tag1" }, { name: "tag2" }, { name: "tag3" }], "Tags should be pushed to array without miaw field");

  await UsersCollection.updateAsync(id, { $push: { tags: { $each: [{ name: "tag4" }, { name: "tag5" }], $sort: -1 } } });
  doc = await UsersCollection.findOneAsync(id);
  test.equal(doc.tags, [{ name: "tag5" }, { name: "tag4" }, { name: "tag3" }, { name: "tag2" }, { name: "tag1" }], "Tags should be pushed to array in correct order");

  await UsersCollection.updateAsync(id, { $push: { tags: { $each: [{ name: "tag6" }, { name: "tag7" }], $slice: 3, $sort: -1 } } });
  doc = await UsersCollection.findOneAsync(id);
  test.equal(doc.tags, [{ name: "tag7" }, { name: "tag6" }, { name: "tag5" }], "Tags should be limited to the last 3 elements after pushing new tags");

  await UsersCollection.updateAsync(id, { $push: { tags: { $each: [{ name: "tag8" }, { name: "tag9" }], $position: 2 } } });
  doc = await UsersCollection.findOneAsync(id);
  test.equal(doc.tags, [{ name: "tag7" }, { name: "tag6" }, { name: "tag8" }, { name: "tag9" }, { name: "tag5" }], "Tags should include tag8 and tag9 after pushing with $each in position 2");

  await UsersCollection.removeAsync({}, { multi: true });
});


Tinytest.addAsync("extendWithSchema - skip schema validation", async (test) => {
  const TestCollection = createTestCollection("test");
  const schema = z.object({
    name: z.string(),
    age: z.number(),
  });

  TestCollection.withSchema(schema);

  // Test inserting with schema validation
  try {
    await TestCollection.insertAsync({ name: "John", age: "30" });
    test.fail("Should throw ValidationError for invalid type");
  } catch (error) {
    test.isTrue(ValidationError.is(error), "Error should be a ValidationError");
    test.equal(error.details[0].type, "invalid_type", "Error should be about invalid type");
  }

  // Test inserting with schema validation skipped
  const id = await TestCollection.insertAsync({ name: "John", age: "30" }, { skipSchema: true });
  const doc = await TestCollection.findOneAsync(id);
  test.equal(doc.name, "John", "Name should be inserted");
  test.equal(doc.age, "30", "Age should be inserted as a string");

  // Test updating with schema validation
  try {
    await TestCollection.updateAsync(id, { $set: { age: "31" } });
    test.fail("Should throw ValidationError for invalid type");
  } catch (error) {
    test.isTrue(ValidationError.is(error), "Error should be a ValidationError");
    test.equal(error.details[0].type, "invalid_type", "Error should be about invalid type");
  }

  // Test updating with schema validation skipped
  await TestCollection.updateAsync(id, { $set: { age: "31" } }, { skipSchema: true });
  const updatedDoc = await TestCollection.findOneAsync(id);
  test.equal(updatedDoc.age, "31", "Age should be updated as a string");
});


Tinytest.addAsync("extendWithSchema - withUser", async (test) => {
  const TestCollection = createTestCollection("test");
  const schema = z.object({
    name: z.string(),
    age: z.number(),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  });

  TestCollection.withSchema(schema).withUser();

  // Mock user context
  const mockUserId = Random.id();
  const originalUserId = Meteor.userId;
  Meteor.userId = () => mockUserId;

  // Test inserting with user
  const id = await TestCollection.insertAsync({ name: "Alice", age: 25 });
  let doc = await TestCollection.findOneAsync(id);
  test.equal(doc.name, "Alice", "Name should be inserted");
  test.equal(doc.age, 25, "Age should be inserted");
  test.equal(doc.userId, mockUserId, "userId should be set to the current user ID");

  // Test updating with user
  await TestCollection.updateAsync(id, { $set: { age: 26 } });
  doc = await TestCollection.findOneAsync(id);
  test.equal(doc.age, 26, "Age should be updated");
  test.equal(doc.userId, mockUserId, "userId should remain unchanged");

  // Test inserting without user context
  Meteor.userId = () => null;

  try {
    await TestCollection.insertAsync({ name: "Bob", age: 30 });
    test.fail("Should throw ValidationError for invalid type");
  } catch (error) {
    test.isTrue(ValidationError.is(error), "Error should be a ValidationError");
    test.equal(error.details[0].type, "invalid_type", "Error should be about invalid type");
  }

  // Restore original Meteor.userId
  Meteor.userId = originalUserId;
});


Tinytest.addAsync("extendWithSchema - $inc", async (test) => {
  const TestCollection = createTestCollection("test");
  const schema = z.object({
    name: z.string(),
    age: z.number(),
    meta: z.object({
      version: z.number(),
      counter: z.number(),
    }),
    transactions: z.array(z.object({
      amount: z.number(),
    })),
  });

  TestCollection.withSchema(schema);

  const docId = await TestCollection.insertAsync({ name: "Alice", age: 25, meta: { version: 1, counter: 1 }, transactions: [{ amount: 100 }] });
  await TestCollection.updateAsync(docId, { $inc: { age: 1 } });
  const doc = await TestCollection.findOneAsync(docId);
  test.equal(doc.age, 26, "Age should be incremented");

  await TestCollection.updateAsync(docId, { $inc: { "meta.version": 1 } });
  const doc2 = await TestCollection.findOneAsync(docId);
  test.equal(doc2.meta.version, 2, "Version should be incremented");
  test.equal(doc2.meta.counter, 1, "Counter should be 1");

  await TestCollection.updateAsync(docId, { $inc: { "transactions.0.amount": 1 } });
  const doc3 = await TestCollection.findOneAsync(docId);
  test.equal(doc3.transactions[0].amount, 101, "Amount should be incremented");
});


Tinytest.addAsync("extendWithSchema - $pop", async (test) => {
  const TestCollection = createTestCollection("popTest2", true);
  const schema = z.object({
    name: z.string(),
    scores: z.array(z.number()),
    tags: z.array(z.string()),
    meta: z.object({
      views: z.array(z.number()).optional(),
    }).optional(),
  });

  TestCollection.withSchema(schema);

  const docId = await TestCollection.insertAsync({
    name: "Charlie",
    scores: [10, 20, 30, 40, 50],
    tags: ["a", "b", "c", "d", "e"],
    meta: {
      views: [1, 2, 3, 4, 5],
    },
  });

  // Test $pop with 1 (remove last element)
  await TestCollection.updateAsync(docId, { $pop: { scores: 1 } });
  let doc = await TestCollection.findOneAsync(docId);
  test.equal(doc.scores, [10, 20, 30, 40], "Last score should be removed");

  // Test $pop with -1 (remove first element)
  await TestCollection.updateAsync(docId, { $pop: { tags: -1 } });
  doc = await TestCollection.findOneAsync(docId);
  test.equal(doc.tags, ["b", "c", "d", "e"], "First tag should be removed");

  // Test $pop on multiple fields
  await TestCollection.updateAsync(docId, { $pop: { tags: -1, scores: 1 } });
  doc = await TestCollection.findOneAsync(docId);
  test.equal(doc.tags, ["c", "d", "e"], "First tag should be removed");
  test.equal(doc.scores, [10, 20, 30], "Last score should be removed");

  // Test $pop with -1 (remove first element) on nested field
  await TestCollection.updateAsync(docId, { $pop: { "meta.views": -1 } });
  doc = await TestCollection.findOneAsync(docId);
  test.equal(doc.meta.views, [2, 3, 4, 5], "First view should be removed");

  // Test $pop on empty array
  await TestCollection.updateAsync(docId, { $set: { scores: [], "meta.views": [1, 2, 3, 4, 5] } });
  await TestCollection.updateAsync(docId, { $pop: { scores: 1 } });
  doc = await TestCollection.findOneAsync(docId);
  test.equal(doc.scores, [], "Popping from empty array should have no effect");

  // Test $pop with invalid value
  try {
    await TestCollection.updateAsync(docId, { $pop: { tags: 2 } });
    test.fail("Should throw ValidationError for invalid $pop value");
  } catch (error) {
    test.isTrue(ValidationError.is(error), "Error should be a ValidationError");
    test.equal(error.details[0].type, "invalid_array_pop_operation", "Error should be about invalid array pop operation");
  }

  // Test $pop with invalid field
  try {
    await TestCollection.updateAsync(docId, { $pop: { "miaw.tags": 1 } });
    test.fail("Should throw ValidationError for invalid field");
  } catch (error) {
    test.isTrue(ValidationError.is(error), "Error should be a ValidationError");
    test.equal(error.details[0].type, "invalid_field", "Error should be about invalid field");
  }

  // Test $pop with invalid array field
  try {
    await TestCollection.updateAsync(docId, { $pop: { name: 1 } });
    test.fail("Should throw ValidationError for invalid array field");
  } catch (error) {
    test.isTrue(ValidationError.is(error), "Error should be a ValidationError");
    test.equal(error.details[0].type, "invalid_array_field", "Error should be about invalid array field");
  }
});

Tinytest.addAsync("extendWithSchema - Schema with union", async (test) => {
  const TestCollection = createTestCollection("test");
  const schema = z.object({
    id: z.string(),
    data: z.union([
      z.object({ type: z.literal("string"), value: z.string() }),
      z.object({ type: z.literal("number"), value: z.number() }),
      z.object({ type: z.literal("boolean"), value: z.boolean() }),
    ]),
  });

  TestCollection.withSchema(schema);

  // Test valid insertions
  const stringId = await TestCollection.insertAsync({ id: "str1", data: { type: "string", value: "test" } });
  test.isNotUndefined(stringId, "Should insert string data");

  const numberId = await TestCollection.insertAsync({ id: "num1", data: { type: "number", value: 42 } });
  test.isNotUndefined(numberId, "Should insert number data");

  const booleanId = await TestCollection.insertAsync({ id: "bool1", data: { type: "boolean", value: true } });
  test.isNotUndefined(booleanId, "Should insert boolean data");

  // Test invalid insertions
  try {
    await TestCollection.insertAsync({ id: "invalid1", data: { type: "string", value: 123 } });
    test.fail("Should not insert mismatched type and value");
  } catch (error) {
    test.isTrue(ValidationError.is(error), "Error should be a ValidationError");
  }

  try {
    await TestCollection.insertAsync({ id: "invalid2", data: { type: "unknown", value: "test" } });
    test.fail("Should not insert unknown type");
  } catch (error) {
    test.isTrue(ValidationError.is(error), "Error should be a ValidationError");
  }

  // Test valid updates
  await TestCollection.updateAsync(stringId, { $set: { data: { type: "number", value: 100 } } });
  const updatedDoc = await TestCollection.findOneAsync(stringId);
  test.equal(updatedDoc.data, { type: "number", value: 100 }, "Should update to valid union type");

  // Test invalid updates
  try {
    await TestCollection.updateAsync(numberId, { $set: { data: { type: "number", value: "not a number" } } });
    test.fail("Should not update with invalid value for type");
  } catch (error) {
    test.isTrue(ValidationError.is(error), "Error should be a ValidationError");
  }
});

Tinytest.addAsync("extendWithSchema - Schema with union on nested field", async (test) => {
  const TestCollection = new Mongo.Collection("nestedUnionSchema");
  const schema = z.object({
    id: z.string(),
    nested: z.object({
      data: z.union([
        z.object({ type: z.literal("string"), value: z.string() }),
        z.object({ type: z.literal("number"), value: z.number() }),
        z.object({ type: z.literal("boolean"), value: z.boolean() }),
      ]),
    }),
  });

  TestCollection.withSchema(schema);

  // Test valid insertions
  const stringId = await TestCollection.insertAsync({
    id: "str1",
    nested: { data: { type: "string", value: "test" } },
  });
  test.isNotUndefined(stringId, "Should insert nested string data");

  const numberId = await TestCollection.insertAsync({
    id: "num1",
    nested: { data: { type: "number", value: 42 } },
  });
  test.isNotUndefined(numberId, "Should insert nested number data");

  const booleanId = await TestCollection.insertAsync({
    id: "bool1",
    nested: { data: { type: "boolean", value: true } },
  });
  test.isNotUndefined(booleanId, "Should insert nested boolean data");

  // Test invalid insertions
  try {
    await TestCollection.insertAsync({
      id: "invalid1",
      nested: { data: { type: "string", value: 123 } },
    });
    test.fail("Should not insert mismatched type and value in nested field");
  } catch (error) {
    test.isTrue(ValidationError.is(error), "Error should be a ValidationError");
  }

  try {
    await TestCollection.insertAsync({
      id: "invalid2",
      nested: { data: { type: "unknown", value: "test" } },
    });
    test.fail("Should not insert unknown type in nested field");
  } catch (error) {
    test.isTrue(ValidationError.is(error), "Error should be a ValidationError");
  }

  // Test valid updates
  await TestCollection.updateAsync(stringId, {
    $set: { "nested.data": { type: "number", value: 100 } },
  });
  const updatedDoc = await TestCollection.findOneAsync(stringId);
  test.equal(updatedDoc.nested.data, { type: "number", value: 100 }, "Should update nested field to valid union type");

  // Test invalid updates
  try {
    await TestCollection.updateAsync(numberId, {
      $set: { "nested.data": { type: "number", value: "not a number" } },
    });
    test.fail("Should not update nested field with invalid value for type");
  } catch (error) {
    test.isTrue(ValidationError.is(error), "Error should be a ValidationError");
  }
});

Tinytest.addAsync("extendWithSchema - Schema optional array field", async (test) => {
  const TestCollection = createTestCollection("optionalArrayField");
  const schema = z.object({
    id: z.string(),
    completedProcesses: z
      .array(z.object({
        userId: z
          .string()
          .length(17, {
            message: "El Id de usuario debe ser valido.",
          })
          .optional()
          .describe("Usuario"),
        processId: z
          .string()
          .length(17, {
            message: "El Id del proceso debe ser valido.",
          })
          .describe("Proceso"),
        status: z
          .enum([
            "PENDING",
            "PROCESSING",
            "COMPLETED",
            "CANCELED",
          ])
          .describe("Estado"),
        notes: z
          .string()
          .optional()
          .describe("Notas"),
      })).optional(),
  });

  TestCollection.withSchema(schema);

  const docId = await TestCollection.insertAsync({
    id: "doc1",
    completedProcesses: [
      { userId: "12345678912345678", processId: "12345678912345678", status: "PENDING", notes: "Some notes" },
    ],
  });

  const doc = await TestCollection.findOneAsync(docId);
  test.equal(doc.completedProcesses.length, 1, "Should insert one completed process");
  test.equal(doc.completedProcesses[0].userId, "12345678912345678", "Should insert user id");
  test.equal(doc.completedProcesses[0].processId, "12345678912345678", "Should insert process id");
  test.equal(doc.completedProcesses[0].status, "PENDING", "Should insert status");
  test.equal(doc.completedProcesses[0].notes, "Some notes", "Should insert notes");

  await TestCollection.updateAsync(
    { _id: docId, "completedProcesses.processId": "12345678912345678" },
    { $set: { "completedProcesses.$.status": "PROCESSING" } },
  );
  const doc2 = await TestCollection.findOneAsync(docId);
  test.equal(doc2.completedProcesses.length, 1, "Should stay the same length");
  test.equal(doc2.completedProcesses[0].userId, "12345678912345678", "Should stay the same user id");
  test.equal(doc2.completedProcesses[0].processId, "12345678912345678", "Should stay the same process id");
  test.equal(doc2.completedProcesses[0].status, "PROCESSING", "Should update to PROCESSING");
  test.equal(doc2.completedProcesses[0].notes, "Some notes", "Should stay the same notes");
});

Tinytest.addAsync("extendWithSchema - $unset", async (test) => {
  const TestCollection = createTestCollection("unsetTest");
  const schema = z.object({
    name: z.string(),
    age: z.number(),
    meta: z.object({
      clicks: z.number(),
      views: z.number(),
    }).optional(),
  });

  TestCollection.withSchema(schema);

  const docId = await TestCollection.insertAsync({
    name: "John",
    age: 30,
    meta: { clicks: 100, views: 200 },
  });

  try {
    await TestCollection.updateAsync(docId, { $unset: { "nonexistent": true } });
    test.fail("Should throw validation error for nonexistent field");
  } catch (e) {
    test.instanceOf(e, ValidationError, "Should throw ValidationError");
    test.equal(e.details[0].name, "nonexistent", "Should indicate which field failed");
  }

  try {
    await TestCollection.updateAsync(docId, { $unset: { "meta.nonexistent": true } });
    test.fail("Should throw validation error for nonexistent nested field");
  } catch (e) {
    test.instanceOf(e, ValidationError, "Should throw ValidationError");
    test.equal(e.details[0].name, "meta.nonexistent", "Should indicate which nested field failed");
  }

  await TestCollection.updateAsync(docId, { $unset: { "meta.clicks": true } });
  const doc = await TestCollection.findOneAsync(docId);
  test.equal(doc.age, 30, "Should stay the same age field");
  test.equal(doc.meta.clicks, undefined, "Should unset clicks field");
  test.equal(doc.meta.views, 200, "Should stay the same views field");

  await TestCollection.updateAsync(docId, { $unset: { meta: true } });
  const doc2 = await TestCollection.findOneAsync(docId);
  test.equal(doc2.age, 30, "Should stay the same age field");
  test.equal(doc2.meta, undefined, "Should unset meta field");
});

Tinytest.addAsync("extendWithSchema - $pull", async (test) => {
  const TestCollection = createTestCollection("pullTest", true);
  const schema = z.object({
    name: z.string(),
    age: z.number(),
    tags: z.array(z.string()),
    meta: z.object({
      clicks: z.number(),
      views: z.number(),
      tags: z.array(z.object({ id: z.number(), name: z.string() })),
    }),
  });

  TestCollection.withSchema(schema);

  const docId = await TestCollection.insertAsync({
    name: "John",
    age: 30,
    tags: ["a", "b", "c"],
    meta: {
      clicks: 100,
      views: 200,
      tags: [{ id: 1, name: "a" }, { id: 2, name: "b" }, { id: 3, name: "c" }, { id: 4, name: "d" }, { id: 5, name: "e" }, { id: 6, name: "f" }],
    },
  });

  await TestCollection.updateAsync(docId, { $pull: { tags: "a" } });
  const doc = await TestCollection.findOneAsync(docId);
  test.equal(doc.tags.length, 2, "2 items should remain");
  test.equal(doc.tags[0], "b", "Tag b should remain");
  test.equal(doc.tags[1], "c", "Tag c should remain");
  test.equal(doc.age, 30, "Should stay the same age field");

  try {
    await TestCollection.updateAsync(docId, { $pull: { tags: { type: "string" } } });
    test.fail("Should throw validation error for invalid pull criteria 2");
  } catch (e) {
    test.instanceOf(e, ValidationError, "Should throw ValidationError");
    test.equal(e.details[0].name, "tags", "Should indicate which field failed");
  }

  await TestCollection.updateAsync(docId, { $pull: { "meta.tags": { id: 1 } } });
  const doc2 = await TestCollection.findOneAsync(docId);
  test.equal(doc2.meta.tags.length, 5, "5 items should remain");
  test.equal(doc2.meta.tags[0].id, 2, "Tag 2 should remain");
  test.equal(doc2.meta.tags[1].id, 3, "Tag 3 should remain");
  test.equal(doc2.meta.tags[2].id, 4, "Tag 4 should remain");
  test.equal(doc2.meta.tags[3].id, 5, "Tag 5 should remain");
  test.equal(doc2.meta.tags[4].id, 6, "Tag 6 should remain");
  test.equal(doc2.age, 30, "Should stay the same age field");

  try {
    await TestCollection.updateAsync(docId, { $pull: { "meta.tags": "a" } });
    test.fail("Should throw validation error for invalid pull criteria 1");
  } catch (e) {
    test.instanceOf(e, ValidationError, "Should throw ValidationError");
    test.equal(e.details[0].name, "meta.tags", "Should indicate which field failed");
  }

  await TestCollection.updateAsync(docId, { $pull: { "meta.tags": { id: { $gt: 3 } } } });
  const doc3 = await TestCollection.findOneAsync(docId);
  test.equal(doc3.meta.tags.length, 2, "2 tags should remain");
  test.equal(doc3.meta.tags[0].id, 2, "Tag 2 should remain");
  test.equal(doc3.meta.tags[1].id, 3, "Tag 3 should remain");
  test.equal(doc3.age, 30, "Should stay the same age field");
});

Tinytest.addAsync("extendWithSchema - $pullAll", async (test) => {
  const TestCollection = createTestCollection("pullAllTest", true);
  const schema = z.object({
    name: z.string(),
    age: z.number(),
    tags: z.array(z.string()),
    meta: z.object({
      clicks: z.number(),
      views: z.number(),
      tags: z.array(z.object({ id: z.number(), name: z.string() })),
    }),
  });

  TestCollection.withSchema(schema);

  const docId = await TestCollection.insertAsync({
    name: "John",
    age: 30,
    tags: ["a", "b", "c"],
    meta: {
      clicks: 100,
      views: 200,
      tags: [{ id: 1, name: "a" }, { id: 2, name: "b" }, { id: 3, name: "c" }, { id: 4, name: "d" }, { id: 5, name: "e" }, { id: 6, name: "f" }],
    },
  });

  await TestCollection.updateAsync(docId, { $pullAll: { tags: ["a", "b"] } });
  const doc = await TestCollection.findOneAsync(docId);
  test.equal(doc.tags.length, 1, "1 item should remain");
  test.equal(doc.tags[0], "c", "Tag c should remain");
  test.equal(doc.age, 30, "Should stay the same age field");

  try {
    await TestCollection.updateAsync(docId, { $pullAll: { tags: { type: "string" } } });
    test.fail("Should throw validation error for invalid pullAll criteria");
  } catch (e) {
    test.instanceOf(e, ValidationError, "Should throw ValidationError");
    test.equal(e.details[0].name, "tags", "Should indicate which field failed");
  }

  try {
    await TestCollection.updateAsync(docId, { $pullAll: { "meta.tags": { id: 1 } } });
    test.fail("Should throw validation error for invalid pullAll criteria");
  } catch (e) {
    test.instanceOf(e, ValidationError, "Should throw ValidationError");
    test.equal(e.details[0].name, "meta.tags", "Should indicate which field failed");
  }

  await TestCollection.updateAsync(docId, { $pullAll: { "meta.tags": [{ id: 1, name: "a" }, { id: 2, name: "b" }] } });
  const doc3 = await TestCollection.findOneAsync(docId);
  test.equal(doc3.meta.tags.length, 4, "4 items should remain");
  test.equal(doc3.meta.tags[0].id, 3, "Tag 3 should remain");
  test.equal(doc3.meta.tags[1].id, 4, "Tag 4 should remain");
  test.equal(doc3.meta.tags[2].id, 5, "Tag 5 should remain");
  test.equal(doc3.meta.tags[3].id, 6, "Tag 6 should remain");
  test.equal(doc3.age, 30, "Should stay the same age field");
});

Tinytest.addAsync("extendWithSchema - $push with array of messages", async (test) => {
  const TestCollection = createTestCollection("pushTest");
  const schema = z.object({
    name: z.string(),
    messages: z.array(z.discriminatedUnion("type", [
      z.object({
        type: z.literal("text"),
        text: z.string(),
        timestamp: z.date(),
      }),
      z.object({
        type: z.enum(["image", "audio", "video", "file"]),
        url: z.string().optional(),
        caption: z.string().optional(),
        timestamp: z.date(),
      }),
    ])).default([]),
  });

  TestCollection.withSchema(schema);

  const docId = await TestCollection.insertAsync({
    name: "John",
    messages: [{
      type: "text",
      text: "Hello",
      timestamp: new Date(),
    }],
  });

  await TestCollection.updateAsync(docId, {
    $push: {
      messages: {
        type: "text",
        text: "World",
        timestamp: new Date(),
      },
    },
  });

  const doc = await TestCollection.findOneAsync(docId);
  test.equal(doc.messages.length, 2, "Should have 2 messages");
  test.equal(doc.messages[1].text, "World", "Second message should be 'World'");
  test.instanceOf(doc.messages[1].timestamp, Date, "Timestamp should be a Date");

  try {
    await TestCollection.updateAsync(docId, {
      $push: {
        messages: {
          type: "text",
          text: 123,
          timestamp: new Date(),
        },
      },
    });
    test.fail("Should throw ValidationError for invalid message text");
  } catch (error) {
    test.isTrue(ValidationError.is(error), "Error should be a ValidationError");
    test.equal(error.details[0].name, "text", "Error should be about the text field");
  }

  try {
    await TestCollection.updateAsync(docId, {
      $push: {
        messages: {
          type: "text",
          text: "Invalid timestamp",
          timestamp: "not a date",
        },
      },
    });
    test.fail("Should throw ValidationError for invalid timestamp");
  } catch (error) {
    test.isTrue(ValidationError.is(error), "Error should be a ValidationError");
    test.equal(error.details[0].name, "timestamp", "Error should be about the timestamp field");
  }
});

Tinytest.addAsync("extendWithSchema - dot notation $set operation issue", async (test) => {
  const TestCollection = createTestCollection("dotNotationTest", true);

  // Recreate the exact schema from the reported issue
  const activityGpxSchema = z.object({
    GPX: z.object({
      type: z.string(),
      features: z.array(
        z.object({
          type: z.string(),
          properties: z.object({
            time: z.string(),
            coordinateProperties: z.object({
              times: z.array(z.string()),
              heart: z.array(z.number()),
              segments: z.array(
                z.object({
                  index: z.number(),
                  highway: z.string().nullable(),
                  surface: z.string().nullable(),
                  tracktype: z.string().nullable(),
                  smoothness: z.string().nullable(),
                }),
              ).optional(),
            }),
          }),
          geometry: z.object({
            type: z.string(),
            coordinates: z.array(z.array(z.number())),
          }),
        }),
      ),
    }),
    isCorrectGpx: z.boolean(),
  });

  TestCollection.withSchema(activityGpxSchema);

  // Insert initial document
  const docId = await TestCollection.insertAsync({
    GPX: {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        properties: {
          time: "2023-01-01T00:00:00Z",
          coordinateProperties: {
            times: ["2023-01-01T00:00:00Z"],
            heart: [70],
            segments: [{
              index: 0,
              highway: "primary",
              surface: "asphalt",
              tracktype: null,
              smoothness: null,
            }],
          },
        },
        geometry: {
          type: "LineString",
          coordinates: [[0, 0], [1, 1], [2, 2]],
        },
      }],
    },
    isCorrectGpx: false,
  });

  // Test the previously problematic update operation that should now work
  await TestCollection.updateAsync(
    { _id: docId },
    {
      $set: {
        "GPX.features.0.geometry.coordinates": [[0, 0], [1, 1], [2, 2], [3, 3]],
        isCorrectGpx: true,
      },
    },
  );

  const fixedDoc = await TestCollection.findOneAsync(docId);
  test.equal(fixedDoc.isCorrectGpx, true, "isCorrectGpx should be updated");
  test.equal(fixedDoc.GPX.features[0].geometry.coordinates.length, 4, "Coordinates should be updated with dot notation");

  // Test that invalid dot notation still fails validation
  try {
    await TestCollection.updateAsync(
      { _id: docId },
      {
        $set: {
          "GPX.features.0.geometry.coordinates": "invalid_coordinates", // Should be array of arrays
          isCorrectGpx: false,
        },
      },
    );
    test.fail("Should throw ValidationError for invalid dot notation value");
  } catch (error) {
    test.isTrue(ValidationError.is(error), "Error should be a ValidationError");
    test.equal(error.details[0].name, "GPX.features.0.geometry.coordinates", "Error should be about the dot notation field");
  }

  // Test that the same operation works with skipSchema: true
  await TestCollection.updateAsync(
    { _id: docId },
    {
      $set: {
        "GPX.features.0.geometry.coordinates": [[0, 0], [1, 1], [2, 2], [3, 3]],
        isCorrectGpx: true,
      },
    },
    { skipSchema: true },
  );

  const updatedDoc = await TestCollection.findOneAsync(docId);
  test.equal(updatedDoc.isCorrectGpx, true, "isCorrectGpx should be updated 2");
  test.equal(updatedDoc.GPX.features[0].geometry.coordinates.length, 4, "Coordinates should be updated with skipSchema");

  // Test that regular nested updates work fine
  await TestCollection.updateAsync(
    { _id: docId },
    {
      $set: {
        "GPX.features.0.properties.time": "2023-01-01T01:00:00Z",
        isCorrectGpx: false,
      },
    },
  );

  const regularUpdateDoc = await TestCollection.findOneAsync(docId);
  test.equal(regularUpdateDoc.GPX.features[0].properties.time, "2023-01-01T01:00:00Z", "Regular nested update should work");
  test.equal(regularUpdateDoc.isCorrectGpx, false, "isCorrectGpx should be updated 3");
});

Tinytest.addAsync("extendWithSchema - GPX coordinates update with numeric array path", async (test) => {
  const TestCollection = createTestCollection(`activityGpxUpdate-${Random.id()}`, true);
  const activityGpxSchema = z.object({
    GPX: z.object({
      type: z.string(),
      features: z.array(
        z.object({
          type: z.string(),
          properties: z.object({
            time: z.string(),
            coordinateProperties: z.object({
              times: z.array(z.string()),
              heart: z.array(z.number()),
              segments: z.array(
                z.object({
                  index: z.number(),
                  highway: z.string().nullable(),
                  surface: z.string().nullable(),
                  tracktype: z.string().nullable(),
                  smoothness: z.string().nullable(),
                }),
              ).optional(),
            }),
          }),
          geometry: z.object({
            type: z.string(),
            coordinates: z.array(z.array(z.number())),
          }),
        }),
      ),
    }),
    isCorrectGpx: z.boolean(),
  });

  TestCollection.withSchema(activityGpxSchema);

  const id = await TestCollection.insertAsync({
    GPX: {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        properties: {
          time: "2023-01-01T00:00:00Z",
          coordinateProperties: {
            times: ["2023-01-01T00:00:00Z"],
            heart: [70],
          },
        },
        geometry: {
          type: "LineString",
          coordinates: [[0, 0], [1, 1]],
        },
      }],
    },
    isCorrectGpx: false,
  });
  const timeGpsData = [[10.1, 20.2], [30.3, 40.4], [50.5, 60.6]];

  await TestCollection.updateAsync(
    { _id: id },
    {
      $set: {
        "GPX.features.0.geometry.coordinates": timeGpsData,
        isCorrectGpx: true,
      },
    },
  );

  const updatedDoc = await TestCollection.findOneAsync(id);

  test.equal(
    updatedDoc.GPX.features[0].geometry.coordinates,
    timeGpsData,
    "Coordinates should exactly match the updated GPS data",
  );
  test.isTrue(updatedDoc.isCorrectGpx, "isCorrectGpx should be updated");
});
