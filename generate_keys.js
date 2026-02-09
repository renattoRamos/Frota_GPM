import crypto from 'crypto';
const curve = crypto.createECDH('prime256v1');
curve.generateKeys();

const toBase64Url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const publicKey = toBase64Url(curve.getPublicKey());
const privateKey = toBase64Url(curve.getPrivateKey());

console.log(JSON.stringify({ publicKey, privateKey }));
