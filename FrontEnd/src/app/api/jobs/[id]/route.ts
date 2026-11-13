import { NextRequest, NextResponse } from 'next/server';
import { getBackendBaseUrl } from '@/lib/backendUrl';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authToken = req.headers.get('authorization');

    // 1. Try forwarding to backend
    try {
      const backendUrl = getBackendBaseUrl();
      const res = await fetch(`${backendUrl}/jobs/${id}`, {
        headers: {
          ...(authToken ? { Authorization: authToken } : {})
        }
      });
      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(data);
      }
    } catch (backendErr: any) {
      console.warn('[Next.js API] Backend /jobs/[id] unavailable, using local mock data');
    }

    // 2. Fallback job detail
    const sampleJob = {
      id: id || 'job-1',
      client: 'Hexaware Technologies',
      position: 'Salesforce Manufacturing Cloud Developer',
      title: 'Salesforce Manufacturing Cloud Developer',
      location: 'Remote / Bangalore',
      work_mode: 'Hybrid',
      salary: '$120,000 – $150,000 / year',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      requirements: [
        { id: 'r1', requirement: '5+ years Salesforce development experience', category: 'Technical Skill', is_mandatory: true, weight: 2.0, source_evidence: 'Minimum 5 years of Salesforce hands-on experience' },
        { id: 'r2', requirement: 'Manufacturing Cloud configuration and customization', category: 'Technical Skill', is_mandatory: true, weight: 2.0, source_evidence: 'Deep knowledge of Salesforce Manufacturing Cloud' },
        { id: 'r3', requirement: 'Apex, LWC, and Flow Automation proficiency', category: 'Technical Skill', is_mandatory: true, weight: 1.5, source_evidence: 'Proven track record writing scalable Apex triggers and Lightning Web Components' },
        { id: 'r4', requirement: 'Salesforce Certified Administrator or Platform Developer I', category: 'Certification', is_mandatory: false, weight: 1.0, source_evidence: 'Preferred certifications' },
        { id: 'r5', requirement: 'Strong English communication and Agile sprint execution', category: 'Soft Skill', is_mandatory: false, weight: 1.0, source_evidence: 'Excellent collaboration skills' }
      ]
    };

    return NextResponse.json({
      success: true,
      job: sampleJob,
      data: sampleJob
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Job not found' },
      { status: 500 }
    );
  }
}
