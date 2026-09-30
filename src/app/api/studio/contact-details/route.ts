import { NextResponse } from "next/server";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { createClient } from "@/lib/supabase/server";
import { studioContactDetailsSchema } from "@/lib/finance-proposal";

export async function PATCH(request: Request) {
  const admin = await getActiveStudioAdmin();
  if (!admin) return NextResponse.json({error:"forbidden"},{status:403});
  const parsed = studioContactDetailsSchema.safeParse(await request.json().catch(()=>null));
  if (!parsed.success) return NextResponse.json({error:"invalid"},{status:400});
  const contacts=parsed.data, client=await createClient();
  const {error}=await client.rpc("save_studio_contact_details",{p_studio_id:admin.studio_id,p_website:contacts.website,p_email:contacts.email,p_phone:contacts.phone,p_business_address:contacts.businessAddress});
  if(error) return NextResponse.json({error:"save"},{status:400});
  return NextResponse.json(contacts,{headers:{"Cache-Control":"no-store"}});
}
