import type { Mongo } from "meteor/mongo";

type TestDocument = {
  _id: string;
  title: string;
  items: Array<{ selected: string }>;
};

declare const TestCollection: Mongo.Collection<TestDocument>;

// This block is compiled as a type test but never performs mutations.
if (false) {
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

  // @ts-expect-error zod-schema does not validate removes, so it does not expose skipSchema there.
  TestCollection.removeAsync({ _id: "document-id" }, { skipSchema: true });

  // @ts-expect-error The zod-schema package only extends async mutations.
  TestCollection.update({ _id: "document-id" }, { $set: { title: "invalid" } }, { skipSchema: true });
}
