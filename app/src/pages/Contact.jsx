import React, { useState } from 'react';
import { ShieldCheck, Mail, Send, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import PublicNav from '@/components/sf2x/PublicNav';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export default function Contact() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    const subject = encodeURIComponent(`SF2X contact from ${name || 'a visitor'}`);
    const body = encodeURIComponent(`${message}\n\n— ${name}${email ? ` (${email})` : ''}`);
    window.location.href = `mailto:cam@sf2x.com?subject=${subject}&body=${body}`;
    setSent(true);
  }

  return (
    <div className="min-h-screen bg-[#070A0F] text-slate-200">
      <PublicNav />
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-10">

        <h1 className="font-heading text-3xl sm:text-4xl font-semibold text-white tracking-tight">Contact us</h1>
        <p className="mt-3 text-sm text-slate-400 max-w-xl">
          Questions about epistemic safety, governed AI deployments, or enterprise plans? Reach the SF2X team directly.
        </p>

        <div className="mt-8 grid sm:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-6">
            <div className="flex items-center gap-2 text-emerald-300">
              <Mail className="h-4 w-4" />
              <span className="text-sm font-medium">Email</span>
            </div>
            <a href="mailto:cam@sf2x.com" className="mt-3 block text-lg text-white hover:text-emerald-300">cam@sf2x.com</a>
            <p className="mt-2 text-sm text-slate-400">We typically reply within one business day.</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-6">
            <div className="text-sm font-medium text-emerald-300">Follow SF2X</div>
            <ul className="mt-3 space-y-2 text-sm">
              <li><a href="https://github.com/sf2x" className="text-slate-300 hover:text-white" target="_blank" rel="noopener noreferrer">GitHub</a></li>
              <li><a href="https://www.linkedin.com/company/sf2x" className="text-slate-300 hover:text-white" target="_blank" rel="noopener noreferrer">LinkedIn</a></li>
              <li><a href="https://x.com/sf2x" className="text-slate-300 hover:text-white" target="_blank" rel="noopener noreferrer">X / Twitter</a></li>
            </ul>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 rounded-2xl border border-white/10 bg-[#0B0F16] p-6 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="h-11" placeholder="Your name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" placeholder="you@example.com" required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="message">Message</Label>
            <Textarea id="message" value={message} onChange={(e) => setMessage(e.target.value)} rows={5} placeholder="How can we help?" required />
          </div>
          <Button type="submit" className="w-full h-11 bg-gradient-to-br from-emerald-400 to-teal-600 text-[#070A0F]">
            {sent ? <><Check className="h-4 w-4 mr-2" /> Opening your email client…</> : <><Send className="h-4 w-4 mr-2" /> Send message</>}
          </Button>
        </form>

        <footer className="mt-12 pt-6 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-600">
          <span>SF2X · Epistemic Operating System</span>
          <div className="flex items-center gap-4">
            <Link to="/about" className="hover:text-slate-300">About</Link>
            <Link to="/contact" className="hover:text-slate-300">Contact</Link>
            <Link to="/pricing" className="hover:text-slate-300">Pricing</Link>
          </div>
        </footer>
      </div>
    </div>
  );
}