// The current central product packet has notifications.enabled=false. Keep
// this switch closed even though the central registry names a disabled alias.
const CENTRAL_NOTIFICATIONS_ENABLED=false;
const EMAIL_TEMPLATE_ALIASES=Object.freeze([]);
const SMS_TEMPLATE_ALIASES=Object.freeze([]);

export const COMMUNICATION_CHANNELS=Object.freeze({
  email:Object.freeze({enabled:CENTRAL_NOTIFICATIONS_ENABLED,templateAliases:EMAIL_TEMPLATE_ALIASES}),
  sms:Object.freeze({enabled:false,templateAliases:SMS_TEMPLATE_ALIASES}),
  whatsapp:Object.freeze({enabled:false,templateAliases:Object.freeze([])})
});

export function assertProductCommunicationAllowed({channel,templateAlias}={}){
  const policy=COMMUNICATION_CHANNELS[channel];
  if(!policy)throw new Error("communications_channel_not_supported");
  if(!policy.enabled){
    if(channel==="sms")throw new Error("communications_sms_sender_template_not_approved");
    if(channel==="email")throw new Error("communications_globally_disabled");
    throw new Error("communications_channel_disabled");
  }
  if(typeof templateAlias!=="string"||!policy.templateAliases.includes(templateAlias))throw new Error("communications_template_not_allowlisted");
  return{channel,templateAlias};
}
