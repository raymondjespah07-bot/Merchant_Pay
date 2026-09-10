import { redirect } from 'next/navigation';
import { currentBusiness } from '@/lib/current-user';
import SettingsClient from './settings-client';
export default async function SettingsPage(){const context=await currentBusiness();if(!context)redirect('/login');if(context.business.suspended)redirect('/dashboard/suspended');return <SettingsClient/>;}
