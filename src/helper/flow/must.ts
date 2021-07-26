export const mustPass = <T>(action: Promise<T>): Promise<T> => {
  return action
    .then((r) => r)
    .catch((e) => {
      throw new Error(`Action failed w/ msg ${e}, ${e.data}`);
    });
};

export function floateq(a: number, b: number, e: number): boolean {
  return Math.abs((a - b) / (a + b)) < e;
}

export const mustFail = <T>(p: Promise<T>): Promise<Error> => {
  return p
    .then(r => {
      throw new Error(`Action should have failed but succeeded ${r}`);
    }, () => {
      return null
    })
}

