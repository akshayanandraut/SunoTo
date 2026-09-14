// Curated radio tracks may only use a license that's clearly safe for a commercial,
// ad-and-subscription-funded app to redistribute. CC-BY-NC and unlabeled tracks are
// deliberately not offered as options -- see Decision A in OPUS_DECISIONS.md.
export const RADIO_LICENSES=[
  {id:"cc0",label:"CC0 / Public Domain"},
  {id:"cc-by",label:"CC-BY (attribution required)"},
  {id:"pixabay",label:"Pixabay Music license"},
  {id:"ccmixter",label:"ccMixter (commercial-permitting)"},
  {id:"fma-cc-by",label:"Free Music Archive — CC-BY"},
  {id:"fma-cc0",label:"Free Music Archive — CC0"},
];
export function validRadioLicenseId(id){return RADIO_LICENSES.some(license=>license.id===id);}
