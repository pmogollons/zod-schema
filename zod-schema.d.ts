/* eslint no-unused-vars: 0 */

import { ZodSchema } from "zod";


type AnyObject = Record<string, any>;

declare module "meteor/mongo" {
  namespace Mongo {
    interface Collection<T, U = T> {
      withSchema(schema: ZodSchema): Collection<T, U>;
      withSoftDelete(): Collection<T, U>;
      withDates(): Collection<T, U>;
      withUser(): Collection<T, U>;
      recoverAsync(params: AnyObject): Promise<any>;
    }
  }
}