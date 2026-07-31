import { AssistantApp } from "@/components/assistant-ui/assistant-app";
import { UserSession } from "@/components/auth/user-session";
import { requireApprovedUser } from "@/lib/access";

export default async function Home() {
  await requireApprovedUser();
  return <AssistantApp authSlot={<UserSession />} />;
}
