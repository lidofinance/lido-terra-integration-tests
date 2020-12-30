export const repeat = (
  howMany: number,
  callback: (currentIteration: number) => Promise<any>
) => {
  return new Array(howMany)
    .fill(true)
    .reduce((t, _, i) => t.then(() => callback(i)), Promise.resolve());
};
