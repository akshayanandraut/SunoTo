export function oauthRedirectUrl(origin=globalThis.location?.origin||""){try{return `${new URL(String(origin)).origin}/#/account`;}catch{return "/#/account";}}
