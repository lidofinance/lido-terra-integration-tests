export const mustPass = <T>(action: Promise<T>): Promise<T> => {
    return action
        .then(r => r)
        .catch(e => {
            throw new Error(`Action failed w/ msg ${e}`)
        })
}

export const mustFail = <T>(action: Promise<T>): Promise<Error> => {
    return new Promise((resolve, reject) => {
        action.then(r => {
            reject(new Error(`Action should have failed but succeeded ${r}`))
        })

        action.catch(r => resolve())
    })
}