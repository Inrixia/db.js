const fs = require('fs')
const crypto = require('crypto')

const dbDir = `./db/`
if (!fs.existsSync('dbDir')) fs.mkdirSync(dbDir, { recursive: true })

const dbStore = {}
class db {
	/**
	 * Returns a new file backed object database.
	 * @param {string} name Database name.
	 * @param {string} storePath Path to store the database.
	 * @param {boolean} crypt True to encrypt database contents on disk.
	 * 
	 * @returns {Object} `{dbData}` Transparent object database.
	 */
	constructor(name, storePath=null, crypt=false) {
		if (typeof name !== 'string') throw new Error('db name must be string!')
		if (dbStore[name] != undefined) return dbStore[name].store
		else dbStore[name] = this

		if (storePath != null) this.storePath = storePath
		else this.storePath = `${dbDir}${name}.json`
		
		if (crypt) {
			const hash = crypto.createHash("sha256");
			hash.update(crypt);
			const key = hash.digest().slice(0, 32);
			this.encrypt = string => {
				string = string.toString()
				const iv = crypto.randomBytes(16);
				const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
				let encrypted = cipher.update(string);
				encrypted = Buffer.concat([encrypted, cipher.final()]);
				return iv.toString('hex') + ':' + encrypted.toString('hex');
			}
			this.decrypt = string => {
				string = string.toString()
				const textParts = string.split(':');
				const iv = Buffer.from(textParts.shift(), 'hex');
				const encryptedText = Buffer.from(textParts.join(':'), 'hex');
				const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
				let decrypted = decipher.update(encryptedText);
				decrypted = Buffer.concat([decrypted, decipher.final()]);
				return decrypted.toString();
			}
		}

		this.handler = {
			get: (target, key, receiver) => {
				if (typeof target[key] == 'object') return new Proxy(target[key], this.handler)
				else return Reflect.get(target, key, receiver);
			},
			set: (target, key, value) => {
				target[key] = value
				this.writeStore()
				return true
			}
		}
		this.readStore();
		
		return this.store
	}

	/**
	 * Loads databse from disk into `this.store`
	 */
	readStore() {
		if (fs.existsSync(this.storePath)) {
			let rawStoreData = fs.readFileSync(this.storePath)
			if (rawStoreData == '') this.store =  new Proxy({}, this.handler)
			else if (this.decrypt && rawStoreData[0] == '{') { // Data was previously unencrypted, encrypt it
				this.store = new Proxy(JSON.parse(rawStoreData), this.handler)
				this.writeStore()
			} else {
				if (this.decrypt) rawStoreData = this.decrypt(rawStoreData)
				this.store = new Proxy(JSON.parse(rawStoreData), this.handler)
			}
		} else this.store = new Proxy({}, this.handler)
	}

	/**
	 * Writes `this.store` to disk.
	 */
	writeStore() { 
		let rawStoreData = JSON.stringify(this.store, null, 2)
		if (this.encrypt) rawStoreData = this.encrypt(rawStoreData)
		fs.writeFileSync(this.storePath, rawStoreData)
	}
}

module.exports = db