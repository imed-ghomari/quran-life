import { NextResponse } from 'next/server';

const getDeploymentVersion = () => {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA
    || process.env.VERCEL_DEPLOYMENT_ID
    || process.env.COMMIT_REF
    || process.env.GITHUB_SHA
    || 'dev'
  ).slice(0, 12);
};

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ version: getDeploymentVersion() });
}
