const fs = require('fs')
const { Buffer } = require('buffer')
const sharp = require('sharp')
const heicToJpg = require('heic-convert')
const jimp = require('jimp')


const Utils = {
    file : {
        // make a array of allowed magic nums for the file
        imageVideoMagicNums: {
            image: ['ffd8ffe0', '89504e47', '667479706d696631'],
            video: ['6674797071742020', '667479706d703432', '6674797069736f6d', '6674797069736f32']
        },
        imageVideoMagicNumSet: new Set(['ffd8ffe0', '89504e47', '6674797071742020', '667479706d696631', '667479706d703432', '6674797069736f6d', '6674797069736f32']),
        header: Buffer.from('mvhd'), // movie header / video header
        extRe: /(?:\.([^.]+))?$/, // file extension

        getFilesFromReq: (req) => { // req: request object
            try {
                const files = req.files
                const parsedFiles = []
                if (!req.files) return parsedFiles
                Object.keys(req.files).forEach((file, id) => {
                    parsedFiles.push({ name: files[file]['name'], buffer: files[file]['data'], id })
                })
                return parsedFiles
            } catch(err) {
                console.log(err)
                return null
            }
        },

        // can save multiple files to localStorage
        // save path: ./public/uploads
        handleFiles: async (files, requirements) => {
            /*      
                file: { name, buffer, id(optional: to keep track of files) }
                requirements: { mimeType: [allowed MimeTypes (image, video)], type: name of folder to be saved into}
            */
            try {
                const promises = function() {
                    return files.map(({name, buffer, id}) => new Promise(async (resolve, reject) => {
                        let { mimeType, fileName, extName, path } = Utils.file.getFileMetaData(buffer, name, requirements)
                        if (!mimeType) reject({ path: null, error: { type: 'user', msg: 'INVALID_FILE' } })
                        let converted  = await Utils.file.convertToJpg(buffer, extName)
                        buffer = await Utils.file.compressJpg(converted.buffer, Buffer.byteLength(converted.buffer))
                        await Utils.file.localUpload({ data: buffer }, `${path}/${fileName}.jpg`) // ${extName}
                        resolve({ path: `${path}/${fileName}.jpg`, id })
                    }))
                }
                
                const paths = await Promise.all(promises())
                return { paths }
            } catch(err) {
                console.log(err)
                return { error: { type: 'server' }}
            }
        },
        convertToJpg: async (buffer, extName) => {
            if (extName === 'heic' || extName === 'heif') buffer = await heicToJpg({ buffer, format: 'JPEG'})
            else buffer = await sharp(buffer).jpeg().toBuffer()
            extName = 'jpg'
            return { buffer, ext: extName }
        },
        compressJpg: async (buffer, size) => { // might need to figure out the compression ratio depending on file size
            const data = await jimp.read(buffer).then(image => image.quality(60))
            buffer = await new Promise((resolve, reject) => {
                data.getBuffer((jimp.MIME_JPEG), (err, buff) => {
                    if (err) reject(err)
                    resolve(buff)
                })
            })
            return buffer
        },
        localUpload: async (file, path) => {
            return new Promise((resolve, reject) => {
                fs.writeFile(path, file.data, (err) => {
                    if (err) {
                        console.log('Utils.file.localUpload: Error while writing file!', err)
                        reject({})
                    }
                    else resolve(path)
                })
            })
        },
        localDelete: (path) => {
            return new Promise((resolve, reject) => {
                fs.unlink(path, (err) => {
                    if (err) {
                        console.log('Utils.file.localDelete: Error while deleting file!', err)
                        reject({})
                    }
                    else resolve(true)
                })
            })
        },
        
        getFileMetaData: (data, name, requirements) => {
            try {
                const mimeType = Utils.file.checkMimeType(data)
                if (requirements && requirements.mimeTypes && !requirements.mimeTypes.includes(mimeType)) return { mimeType: null }
                let extName = Utils.file.extRe.exec(name)[1]
                fileName = `${Utils.randString(10)}_${Date.now()}`
                let path = `./public/uploads/${requirements.type}`
                if (!fs.existsSync(path)) fs.mkdirSync(path, { recursive: true })
                return { mimeType, extName, fileName, path }
            } catch(err) {
                console.log(err)
            }
        },
        checkMimeType: (buffer) => {
            try {
                let magicNum = buffer.slice(0, 4)
                if (magicNum[0] === 0) magicNum = buffer.slice(4, 12)
                magicNum = magicNum.toString('hex')
                if (!Utils.file.imageVideoMagicNumSet.has(magicNum)) return ''
                if (Utils.file.imageVideoMagicNums['image'].includes(magicNum)) return 'image'
                else return 'video'
            } catch(err) {
                console.log(err)
            }
        },
        checkVideoDuration: (buffer) => {
            const start = buffer.indexOf(Utils.file.header) + 17
            const timeScale = buffer.readUInt32BE(start)
            const duration = buffer.readUInt32BE(start + 4)
            return (Math.floor((duration / timeScale) * 1000) / 1000)
        }
    },
    randString : (len) => {
        if (len > 100) return 'TooLongLength'
        let result = ''
        let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
        let charactersLength = characters.length
        for ( var i = 0; i < len; i++ ) {
            result += characters.charAt(Math.floor(Math.random() * charactersLength))
        }
        return result;
    }
}

module.exports = Utils
