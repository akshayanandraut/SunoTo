export const DEFAULT_MEMBERSHIP_CONFIG=Object.freeze({plans:[{id:"30d",label:"30 Days",days:30,amountPaise:29900},{id:"90d",label:"90 Days",days:90,amountPaise:74900},{id:"365d",label:"365 Days",days:365,amountPaise:239900}],sparksPerDay:100});
const PLAN_ID=/^[a-z0-9_-]{2,40}$/;
function normalizePlan(value){
  const id=String(value.id||"").trim().toLowerCase(),label=String(value.label||"").trim().slice(0,60),days=Number(value.days),amountPaise=Number(value.amountPaise);
  if(!PLAN_ID.test(id)||!label||!Number.isSafeInteger(days)||days<=0||days>3650||!Number.isSafeInteger(amountPaise)||amountPaise<=0)throw new Error("invalid_membership_plan");
  return{id,label,days,amountPaise};
}
export function normalizeMembershipConfig(value={}){
  const plans=(Array.isArray(value.plans)?value.plans:DEFAULT_MEMBERSHIP_CONFIG.plans).map(normalizePlan);
  if(!plans.length)throw new Error("invalid_membership_plans");
  const sparksPerDay=Number(value.sparksPerDay??DEFAULT_MEMBERSHIP_CONFIG.sparksPerDay);
  if(!Number.isSafeInteger(sparksPerDay)||sparksPerDay<=0||sparksPerDay>100000)throw new Error("invalid_sparks_per_day");
  return{plans,sparksPerDay};
}
