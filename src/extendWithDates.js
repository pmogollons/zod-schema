export function extendWithDates(args, { isUpsert, isUpdate } = {}) {
  if (isUpsert) {
    args[1]["$setOnInsert"] = args[1]["$setOnInsert"] || {};
    args[1]["$setOnInsert"].createdAt = new Date();
    args[1]["$setOnInsert"].updatedAt = new Date();
    args[1]["$set"] = args[1]["$set"] || {};
    args[1]["$set"].updatedAt = new Date();
  } else if (isUpdate) {
    args[1]["$set"] = args[1]["$set"] || {};
    args[1]["$set"].updatedAt = new Date();
    args[1]["$set"].createdAt = undefined;
    delete args[1]["$set"].createdAt;
  } else {
    args[0].createdAt = new Date();
    args[0].updatedAt = new Date();
  }
}