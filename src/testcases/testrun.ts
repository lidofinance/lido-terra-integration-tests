import Conversion from "./conversion"




const runner = async () => {
    await Conversion()
}


runner()
    .then(() => {
        console.log("done")
    })
    .catch(console.log)
