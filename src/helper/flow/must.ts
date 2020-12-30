export const mustPass = <T>(action: Promise<T>): Promise<T> => {
  return action
    .then((r) => r)
    .catch((e) => {
      throw new Error(`Action failed w/ msg ${e}`);
    });
};

export const mustFail = <T>(action: Promise<T>): Promise<Error> => {
  const pathB = action.catch((r) => {
    // noop
    return null;
  });

  const pathA = action.then((r) => {
    throw new Error(`Action should have failed but succeeded ${r}`);
  });

  return Promise.race([pathA, pathB]);
};
