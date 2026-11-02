import { expect,it } from "vitest";
import { additionalMetaAnswers } from "./presentation";
import type { MetaPreview } from "./contracts";
const lead:MetaPreview={id:"1",client_name:"Name",phone:"+380501234567",email:"a@example.test",submitted_at:null,status:"not_imported",reason:null,eligible:true,field_data:[]};
it("hides only repeated row contacts while keeping custom questions and alternate contact values",()=>{
 const result=additionalMetaAnswers({...lead,field_data:[{name:"first_name",values:["Name"]},{name:"phone_number",values:["+380501234567"]},{name:"email",values:["a@example.test","other@example.test"]},{name:"тип_приміщення",values:["Медичний заклад"]}],custom_disclaimer_responses:[{checkbox_key:"privacy",is_checked:true}]});
 expect(result.answers).toEqual([{name:"email",values:["other@example.test"]},{name:"тип_приміщення",values:["Медичний заклад"]}]);expect(result.acknowledgements).toHaveLength(1);
});
it("contact-only leads need neither a details button nor an extra row",()=>{
 expect(additionalMetaAnswers({...lead,field_data:[{name:"full_name",values:["Name"]},{name:"email",values:["a@example.test"]}]})).toEqual({answers:[],acknowledgements:[]});
});
