import axios from 'axios';

interface CallOptions {
  phoneNumber: string;
  customerName: string;
  technicianName: string;
  serviceType: string;
  companyName: string;
  jobNumber: string;
  callbackNumber?: string;
}

interface BlandCallResponse {
  message: string;
  call_id: string;
  category: string;
  log_level: string;
}

interface CallResult {
  success: boolean;
  callId?: string;
  error?: string;
}

const BLAND_API_URL = 'https://api.bland.ai/v1/calls';

export async function triggerCustomerNotHomeCall(options: CallOptions): Promise<CallResult> {
  const apiKey = process.env.BLAND_AI_API_KEY;
  
  if (!apiKey) {
    console.error('BLAND_AI_API_KEY not configured');
    return { success: false, error: 'AI calling not configured' };
  }

  const task = `You are a friendly and professional customer service representative for ${options.companyName}. 
You are calling ${options.customerName} because their technician, ${options.technicianName}, has arrived for their scheduled ${formatServiceType(options.serviceType)} appointment (Job #${options.jobNumber}), but no one appears to be home.

Your goals:
1. Politely inform them that their technician has arrived but couldn't find anyone at the location
2. Ask if they are on their way or if they need to reschedule
3. If they want to reschedule, let them know someone from the office will call them back to find a new time
4. If they say they're on their way, ask approximately how long until they arrive so the technician can wait
5. Thank them for their time

Be warm, professional, and understanding. Keep the call brief and to the point.
${options.callbackNumber ? `If they have questions, they can call back at ${options.callbackNumber}.` : ''}`;

  const firstSentence = `Hi, this is ${options.companyName} calling. Is this ${options.customerName}?`;

  try {
    const response = await axios.post<BlandCallResponse>(
      BLAND_API_URL,
      {
        phone_number: formatPhoneNumber(options.phoneNumber),
        task,
        first_sentence: firstSentence,
        voice_id: 'maya',
        language: 'eng',
        record: true,
        reduce_latency: true,
        max_duration: 5,
        wait_for_greeting: true,
        request_data: {
          job_number: options.jobNumber,
          customer_name: options.customerName,
          technician_name: options.technicianName,
          service_type: options.serviceType
        },
        webhook: process.env.BLAND_WEBHOOK_URL || undefined
      },
      {
        headers: {
          'Authorization': apiKey,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`Bland AI call initiated: ${response.data.call_id}`);
    
    if (process.env.N8N_WEBHOOK_URL) {
      triggerN8nWebhook({
        event: 'customer_not_home_call',
        callId: response.data.call_id,
        ...options
      }).catch(err => console.error('n8n webhook failed:', err));
    }

    return {
      success: true,
      callId: response.data.call_id
    };
  } catch (error: any) {
    console.error('Bland AI call failed:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message || 'Failed to initiate call'
    };
  }
}

export async function getCallDetails(callId: string): Promise<any> {
  const apiKey = process.env.BLAND_AI_API_KEY;
  
  if (!apiKey) {
    return null;
  }

  try {
    const response = await axios.get(`https://api.bland.ai/v1/calls/${callId}`, {
      headers: { 'Authorization': apiKey }
    });
    return response.data;
  } catch (error) {
    console.error('Failed to get call details:', error);
    return null;
  }
}

async function triggerN8nWebhook(data: any): Promise<void> {
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  if (!webhookUrl) return;

  await axios.post(webhookUrl, {
    ...data,
    timestamp: new Date().toISOString(),
    source: 'fieldtech'
  });
}

function formatPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  return phone.startsWith('+') ? phone : `+${digits}`;
}

function formatServiceType(serviceType: string): string {
  return serviceType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}
