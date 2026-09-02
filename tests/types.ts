import type { Mongo } from "meteor/mongo";
import type { ZodSchema } from "zod";

type TestDocument = {
  _id: string;
  title: string;
  items: Array<{ selected: string }>;
  skipSchema?: boolean;
};

declare const TestCollection: Mongo.Collection<TestDocument>;
declare const TestSchema: ZodSchema;

// This block is compiled as a type test but never performs mutations.
// eslint-disable-next-line no-constant-condition
if (false) {
  TestCollection
    .withSchema(TestSchema)
    .withDates()
    .withSoftDelete()
    .withUser({ optional: true });

  TestCollection.withUser({ optional: false });

  TestCollection.insertAsync({
    title: "document field",
    items: [],
    skipSchema: true,
  }) satisfies Promise<string>;

  TestCollection.insertAsync({ title: "inserted", items: [] }, { skipSchema: true }) satisfies Promise<string>;

  TestCollection.updateAsync(
    { _id: "document-id" },
    { $set: { title: "updated" } },
    {
      multi: true,
      upsert: false,
      arrayFilters: [{ "item.selected": "selected" }],
      skipSchema: true,
    },
  ) satisfies Promise<number>;

  TestCollection.upsertAsync(
    { _id: "document-id" },
    { $set: { title: "upserted" } },
    { multi: false, skipSchema: false },
  ) satisfies Promise<{ numberAffected?: number; insertedId?: string }>;

  // @ts-expect-error skipSchema must be boolean when supplied.
  TestCollection.updateAsync({ _id: "document-id" }, { $set: { title: "invalid" } }, { skipSchema: "yes" });

  // @ts-expect-error withUser optional must be boolean when supplied.
  TestCollection.withUser({ optional: "yes" });

  // @ts-expect-error insertAsync accepts at most one options object.
  TestCollection.insertAsync({ title: "invalid", items: [] }, {}, { skipSchema: true });

  // @ts-expect-error zod-schema does not validate removes, so it does not expose skipSchema there.
  TestCollection.removeAsync({ _id: "document-id" }, { skipSchema: true });

  // @ts-expect-error The zod-schema package only extends async mutations.
  TestCollection.update({ _id: "document-id" }, { $set: { title: "invalid" } }, { skipSchema: true });
}
