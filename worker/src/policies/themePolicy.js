export const PATTERNS=[
  {id:"solid",name:"Solid",premium:false},
  {id:"hearts",name:"Hearts",premium:true},
  {id:"stripes",name:"Stripes",premium:true},
  {id:"lines",name:"Lines",premium:true},
  {id:"aurora",name:"Aurora",premium:true},
  {id:"midnight",name:"Midnight",premium:true},
];
export const PALETTES=[
  {id:"mint",name:"Mint",colors:["#184f3a","#dff4e8"]},
  {id:"coral",name:"Coral",colors:["#ff5d3b","#ffe4da"]},
  {id:"sky",name:"Sky",colors:["#1b6fb0","#dceeff"]},
  {id:"sunshine",name:"Sunshine",colors:["#c98a00","#fff3cf"]},
  {id:"berry",name:"Berry",colors:["#a8215f","#ffe0ee"]},
  {id:"charcoal",name:"Charcoal",colors:["#20242b","#dfe3e8"]},
];
export const DEFAULT_PATTERN_ID="solid";
export const DEFAULT_PALETTE_ID="mint";
export function patternById(id){return PATTERNS.find(pattern=>pattern.id===id)||PATTERNS.find(pattern=>pattern.id===DEFAULT_PATTERN_ID);}
export function paletteById(id){return PALETTES.find(palette=>palette.id===id)||PALETTES.find(palette=>palette.id===DEFAULT_PALETTE_ID);}
export function validPatternId(id){return PATTERNS.some(pattern=>pattern.id===id);}
export function validPaletteId(id){return PALETTES.some(palette=>palette.id===id);}
export function patternAllowed(id,isPremium){const pattern=patternById(id);return Boolean(pattern)&&(!pattern.premium||isPremium);}
