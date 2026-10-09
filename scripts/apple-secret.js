#!/usr/bin/env node
// Genera el "Secret Key" de Sign in with Apple para Supabase (un JWT ES256).
// Apple solo lo acepta con vigencia máxima de ~6 meses: hay que regenerarlo antes de que venza.
//
// Uso:
//   node scripts/apple-secret.js --p8 ~/Downloads/AuthKey_XXXXXXXXXX.p8 \
//        --team TEAMID1234 --key XXXXXXXXXX --client com.tu.services.id
//
//   --p8      archivo .p8 descargado al crear la llave (Keys → Sign in with Apple)
//   --team    Team ID (arriba a la derecha en developer.apple.com)
//   --key     Key ID de esa llave (10 caracteres)
//   --client  el Client ID que tienes en Supabase → Sign In / Providers → Apple
//             (el Services ID, p. ej. com.iglesiafreedom.kodesh.web)
// Sin dependencias: solo Node 16+.
const fs = require('fs');
const crypto = require('crypto');

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const miss = ['p8', 'team', 'key', 'client'].filter(k => !args[k]);
if (miss.length) { console.error('Faltan: ' + miss.map(m => '--' + m).join(' ')); process.exit(1); }

const p8 = fs.readFileSync(args.p8.replace(/^~/, process.env.HOME), 'utf8');
const b64u = b => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const now = Math.floor(Date.now() / 1000);
const exp = now + 15777000; // ~182 días, el máximo que permite Apple
const header = { alg: 'ES256', kid: args.key, typ: 'JWT' };
const payload = { iss: args.team, iat: now, exp, aud: 'https://appleid.apple.com', sub: args.client };
const data = b64u(JSON.stringify(header)) + '.' + b64u(JSON.stringify(payload));
const sig = crypto.sign('sha256', Buffer.from(data), { key: p8, dsaEncoding: 'ieee-p1363' });
console.log('\nPega esto en Supabase → Authentication → Sign In / Providers → Apple → Secret Key:\n');
console.log(data + '.' + b64u(sig));
console.log('\nVence: ' + new Date(exp * 1000).toLocaleDateString('es') + '  (pon un recordatorio unas semanas antes)\n');
