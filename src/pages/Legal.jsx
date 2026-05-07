import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Code2 } from 'lucide-react';

const CONTENT = {
  terms: {
    title: 'Terms of Service',
    updated: 'May 7, 2026',
    sections: [
      {
        heading: '1. Acceptance of Terms',
        body: 'By accessing or using WebIDE ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the Service.',
      },
      {
        heading: '2. Description of Service',
        body: 'WebIDE is a browser-based integrated development environment that allows users to write, preview, and export HTML, CSS, and JavaScript projects. The Service is provided "as is" and may be changed or discontinued at any time.',
      },
      {
        heading: '3. User Accounts',
        body: 'You may use the Service as a guest without an account. If you create an account, you are responsible for maintaining the confidentiality of your credentials and for all activity under your account. You must provide accurate information and keep it up to date.',
      },
      {
        heading: '4. User Content',
        body: 'You retain ownership of all code and content you create using the Service. By saving projects to the cloud, you grant us a limited license to store and serve that content to you. We do not claim ownership of your work.',
      },
      {
        heading: '5. Prohibited Use',
        body: 'You agree not to use the Service to: (a) violate any law or regulation; (b) transmit malware or harmful code; (c) attempt to gain unauthorized access to any system; (d) harass or harm other users; or (e) engage in any activity that disrupts the Service.',
      },
      {
        heading: '6. Termination',
        body: 'We reserve the right to suspend or terminate your access to the Service at any time for any reason, including violation of these Terms. You may delete your account at any time from Account Settings.',
      },
      {
        heading: '7. Disclaimer of Warranties',
        body: 'The Service is provided without warranties of any kind, express or implied. We do not guarantee that the Service will be uninterrupted, error-free, or that data will not be lost.',
      },
      {
        heading: '8. Limitation of Liability',
        body: 'To the fullest extent permitted by law, we shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Service.',
      },
      {
        heading: '9. Changes to Terms',
        body: 'We may update these Terms at any time. Continued use of the Service after changes constitutes acceptance of the new Terms.',
      },
      {
        heading: '10. Contact',
        body: 'Questions about these Terms can be sent to the contact information listed on the site.',
      },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    updated: 'May 7, 2026',
    sections: [
      {
        heading: '1. Information We Collect',
        body: 'We collect information you provide directly: your name, email address, and project content when you create an account or save projects. We also collect basic usage data such as page views and feature interactions to improve the Service.',
      },
      {
        heading: '2. How We Use Your Information',
        body: 'We use your information to: (a) provide and maintain the Service; (b) authenticate your identity; (c) save and sync your projects; (d) send important service communications; and (e) improve the Service.',
      },
      {
        heading: '3. Firebase and Google',
        body: 'We use Firebase (by Google) for authentication and data storage. When you sign in with Google, Google\'s privacy policy applies to that interaction. Firebase stores your data in accordance with Google\'s data processing terms.',
      },
      {
        heading: '4. AI Features',
        body: 'If you use the AI assistant, your code and prompts are sent to a third-party AI provider (Anthropic or OpenAI) via our server. We do not permanently store your AI conversations. The AI providers\' privacy policies apply to data sent to their services.',
      },
      {
        heading: '5. Data Sharing',
        body: 'We do not sell your personal data. We share data only with service providers necessary to operate the Service (Firebase/Google, Render for hosting), and as required by law.',
      },
      {
        heading: '6. Data Retention',
        body: 'We retain your account data and projects as long as your account is active. You can delete your account and all associated data at any time from Account Settings.',
      },
      {
        heading: '7. Cookies',
        body: 'We use essential cookies and browser storage (localStorage) to maintain your session and remember your preferences. We do not use third-party tracking or advertising cookies.',
      },
      {
        heading: '8. Security',
        body: 'We implement reasonable security measures to protect your data. However, no method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.',
      },
      {
        heading: '9. Children\'s Privacy',
        body: 'The Service is not directed to children under 13. We do not knowingly collect personal information from children under 13.',
      },
      {
        heading: '10. Changes to this Policy',
        body: 'We may update this Privacy Policy from time to time. We will notify you of significant changes by posting a notice on the Service.',
      },
      {
        heading: '11. Contact',
        body: 'If you have questions about this Privacy Policy or how your data is handled, please contact us through the site.',
      },
    ],
  },
};

export default function Legal() {
  const nav = useNavigate();
  const { page } = useParams();
  const content = CONTENT[page];

  if (!content) {
    nav('/');
    return null;
  }

  return (
    <div className="min-h-screen bg-bg text-white">
      <div className="fixed inset-0 opacity-[0.02] pointer-events-none" style={{
        backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
        backgroundSize: '60px 60px',
      }} />

      <nav className="relative z-10 flex items-center justify-between px-8 py-5 border-b border-border">
        <button onClick={() => nav('/')} className="flex items-center gap-2 text-muted hover:text-white transition-colors text-sm">
          <ArrowLeft size={14} /> Back
        </button>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-white flex items-center justify-center">
            <Code2 size={11} className="text-black" />
          </div>
          <span className="font-display font-700 text-sm">WebIDE</span>
        </div>
      </nav>

      <main className="relative z-10 max-w-2xl mx-auto px-8 py-14">
        <h1 className="font-display text-4xl font-700 tracking-tight mb-2">{content.title}</h1>
        <p className="text-muted text-sm mb-12">Last updated: {content.updated}</p>

        <div className="space-y-8">
          {content.sections.map(s => (
            <div key={s.heading}>
              <h2 className="font-medium text-base mb-2">{s.heading}</h2>
              <p className="text-muted text-sm leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="relative z-10 border-t border-border px-8 py-6 text-center text-muted text-xs mt-12">
        <div className="flex items-center justify-center gap-4">
          <button onClick={() => nav('/legal/terms')} className={`hover:text-white transition-colors ${page === 'terms' ? 'text-white' : ''}`}>Terms of Service</button>
          <span>·</span>
          <button onClick={() => nav('/legal/privacy')} className={`hover:text-white transition-colors ${page === 'privacy' ? 'text-white' : ''}`}>Privacy Policy</button>
        </div>
      </footer>
    </div>
  );
}
