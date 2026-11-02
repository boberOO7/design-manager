import type { MetaPreview } from "./contracts";

// Remove only contact values already represented by the row. Preserve alternate
// values and every custom question; the original answers remain untouched.
export function additionalMetaAnswers(lead: MetaPreview) {
  const contactKeys=new Set(["full_name","first_name","last_name","phone_number","email"]);
  const firstValues=new Map<string,string>();
  for(const field of lead.field_data) {
    const value=field.values.find(value=>value.trim())?.trim();
    if(contactKeys.has(field.name) && value && !firstValues.has(field.name))firstValues.set(field.name,value);
  }
  const answers=lead.field_data.flatMap(field=>{
    const values=field.values.filter(value=>value.trim() && value.trim()!==firstValues.get(field.name));
    return values.length ? [{name:field.name,values}] : [];
  });
  return {answers,acknowledgements:lead.custom_disclaimer_responses ?? []};
}
