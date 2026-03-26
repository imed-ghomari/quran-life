import { NextResponse } from 'next/server';

const getDeploymentVersion = () => {
  return (
    process.env.NEXT_PUBLIC_DEPLOYMENT_ID
    || process.env.COMMIT_REF
    || process.env.BUILD_ID
    || process.env.DEPLOY_ID
    || process.env.VERCEL_GIT_COMMIT_SHA
    || process.env.VERCEL_DEPLOYMENT_ID
    || process.env.GITHUB_SHA
    || 'dev'
  ).slice(0, 12);
};

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ version: getDeploymentVersion() });
}
