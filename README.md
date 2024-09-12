# Zod Schema

zod-schema provides a powerful and flexible way to implement schema validation for Meteor collections using the popular `zod` library. This package allows developers to define schemas for their collections, ensuring that the data being inserted or updated adheres to specified rules and types.

## Key Features:
- **Schema Validation**: Automatically validate documents against defined schemas when inserting or updating, helping to catch errors early in the development process.
- **Soft Delete Support**: Easily implement soft delete functionality with the `withSoftDelete` method, allowing you to mark documents as deleted without removing them from the database.
- **Date Tracking**: Automatically add created and updated timestamps to your documents with the `withDates` method.
- **User Context**: Track which user created a document with the `withUser` method, enhancing accountability and traceability.
- **Flexible Validation**: Skip schema validation when necessary, providing flexibility for specific use cases.

## Installation
To add this package to your Meteor project, run:


How to install:
```bash
meteor add pmogollons:zod-schema
```

# Usage
To use the `zod-schema` package in your Meteor project, follow these steps:

1. **Define Your Schema**: Use the `zod` library to create a schema for your collection. For example:
   ```javascript
   import { z } from "zod";

   const userSchema = z.object({
     name: z.string(),
     age: z.number(),
   });
   ```

2. **Create a Collection**: Create a new Mongo collection and apply the schema using the `withSchema` method.
   ```javascript
   const UserCollection = new Mongo.Collection("users");
   UserCollection.withSchema(userSchema);
   ```

3. **Insert Documents**: When inserting documents, the package will automatically validate them against the defined schema.
   ```javascript
   await UserCollection.insertAsync({ name: "Alice", age: 30 }); // Valid
   await UserCollection.insertAsync({ name: "Bob", age: "thirty" }); // Throws ValidationError
   ```

4. **Update Documents**: Similarly, updates will also be validated.
   ```javascript
   const userId = await UserCollection.insertAsync({ name: "Charlie", age: 25 });
   await UserCollection.updateAsync(userId, { $set: { age: 26 } }); // Valid
   await UserCollection.updateAsync(userId, { $set: { age: "twenty-six" } }); // Throws ValidationError
   ```

5. **Optional Features**: You can also use additional features like soft deletes and date tracking:
   ```javascript
   UserCollection.withSoftDelete();
   UserCollection.withDates();
   UserCollection.withUser();
   ```

6. **Skip Validation**: If you need to skip validation for specific operations, you can do so by passing the `skipSchema` option:
   ```javascript
   await UserCollection.insertAsync({ name: "David", age: "35" }, { skipSchema: true });
   ```

7. **Soft Delete**: You can also use the `recoverAsync` method to recover a soft deleted document.
   ```javascript
   await UserCollection.recoverAsync({ _id: deletedUserId });
   ```

## Caveats
* You can't use dot notation for nested fields on insert or upsert operations yet. Example { "meta.views": 1 }.
* Not all mongo update operators are supported yet. This operations are not validated: ($unset, $inc, $mul, $rename, $min, $max, $currentDate, $, $[], $pull, $pullAll, $bit)
* When using soft delete we add an isDeleted field, when querying the collection you should add the isDeleted: false filter when you want to get the not deleted documents.
* If you are using `pmogollons:nova` any collection that uses soft delete will automatically add a `isDeleted` filter to the root collection of your query.