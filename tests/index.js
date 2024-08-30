import { z } from "zod";
import { Mongo } from "meteor/mongo";
import { Random } from "meteor/random";
import { Tinytest } from "meteor/tinytest";

import { ValidationError } from "../src/ValidationError";


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
    test.equal(error.details[0].type, "invalid_array_operation", "Error should be about invalid array operation");
  }

  try {
    await TestCollection.updateAsync(id, { $push: { tags: 1 } });
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


