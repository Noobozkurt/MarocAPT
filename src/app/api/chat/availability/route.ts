import { json, route } from '@/lib/api';
import { getAvailability } from '@/server/chat';
export const GET = route(async () => json(await getAvailability()));
