export function extendWithDates(args, {
  isUpsert,
  isUpdate,
  isReplacementUpsert,
  existingDocument,
} = {}) {
  const currentDate = new Date();

  if (isReplacementUpsert) {
    args[1].createdAt = existingDocument?.createdAt || currentDate;
    args[1].updatedAt = currentDate;
  } else if (isUpsert) {
    args[1]["$setOnInsert"] = args[1]["$setOnInsert"] || {};
    args[1]["$setOnInsert"].createdAt = currentDate;
    args[1]["$set"] = args[1]["$set"] || {};
    args[1]["$set"].updatedAt = currentDate;
  } else if (isUpdate) {
    args[1]["$set"] = args[1]["$set"] || {};
    args[1]["$set"].updatedAt = currentDate;
    args[1]["$set"].createdAt = undefined;
    delete args[1]["$set"].createdAt;
  } else {
    args[0].createdAt = currentDate;
    args[0].updatedAt = currentDate;
  }
}
