import express from 'express'
import 'dotenv/config'
import path  from 'path'
import { fileURLToPath } from 'url'
import ai from './ai.js'


let app=express()
let _absolute=fileURLToPath(import.meta.url)
const __dirname = path.dirname(_absolute);
export let public_folder= path.join(__dirname,"..","Frontend")


app.use(express.static(public_folder))

app.use('/',ai)

app.listen(process.env.PORT,()=>{
     console.log(`Samson AI running on http://localhost:${process.env.PORT}`)
})