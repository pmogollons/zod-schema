/* eslint no-unused-vars: 0 */

import type { NpmModuleMongodb } from "meteor/npm-mongo";
import type * as m from "meteor/mongo";
import type { ZodSchema } from "zod";

type AnyObject = Record<string, any>;

declare module "meteor/mongo" {
  namespace Mongo {
    interface InsertOptions {
      skipSchema?: boolean;
    }

    interface UpdateOptions {
      skipSchema?: boolean;
    }

    interface UpsertOptions {
      skipSchema?: boolean;
    }

    interface Collection<T, U = T> {
      insertAsync(doc: m.Mongo.OptionalId<T>, options: InsertOptions): Promise<string>;
      updateAsync(
        selector: m.Mongo.Selector<T> | m.Mongo.ObjectID | string,
        modifier: NpmModuleMongodb.UpdateFilter<T>,
        options: UpdateOptions & {
          multi?: boolean;
          upsert?: boolean;
          arrayFilters?: { [identifier: string]: any }[];
        },
        callback?: Function,
      ): Promise<number>;
      upsertAsync(
        selector: m.Mongo.Selector<T> | m.Mongo.ObjectID | string,
        modifier: NpmModuleMongodb.UpdateFilter<T>,
        options: UpsertOptions & { multi?: boolean },
        callback?: Function,
      ): Promise<{
        numberAffected?: number;
        insertedId?: string;
      }>;
      withSchema(schema: ZodSchema): Collection<T, U>;
      withSoftDelete(): Collection<T, U>;
      withDates(): Collection<T, U>;
      withUser(): Collection<T, U>;
      recoverAsync(params: AnyObject): Promise<any>;
    }
  }
}
