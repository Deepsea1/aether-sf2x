import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import { AnimatePresence, motion } from 'framer-motion';
import { useIsMobile } from '@/hooks/use-mobile';
// Add page imports here — code-split via React.lazy for smaller mobile payloads
import { lazy, Suspense, useRef } from 'react';
const Home = lazy(() => import('@/pages/Home'));
const AskHub = lazy(() => import('@/pages/AskHub'));
const Landing = lazy(() => import('@/pages/Landing'));
const Health = lazy(() => import('@/pages/Health'));
const Governance = lazy(() => import('@/pages/Governance'));
const Collective = lazy(() => import('@/pages/Collective'));
const Bench = lazy(() => import('@/pages/Bench'));
const ModelProfile = lazy(() => import('@/pages/ModelProfile'));
const ModelDrift = lazy(() => import('@/pages/ModelDrift'));
const Lineage = lazy(() => import('@/pages/Lineage'));
const Systems = lazy(() => import('@/pages/Systems'));
const TrustCenter = lazy(() => import('@/pages/TrustCenter'));
const GettingStarted = lazy(() => import('@/pages/GettingStarted'));
const Pricing = lazy(() => import('@/pages/Pricing'));
const ApiDocs = lazy(() => import('@/pages/ApiDocs'));
const McpServer = lazy(() => import('@/pages/McpServer'));
const CustomerPortal = lazy(() => import('@/pages/CustomerPortal'));
const Guide = lazy(() => import('@/pages/Guide'));
const UpgradeQueue = lazy(() => import('@/pages/UpgradeQueue'));
const Explore = lazy(() => import('@/pages/Explore'));
const Telemetry = lazy(() => import('@/pages/Telemetry'));
const Report = lazy(() => import('@/pages/Report'));
const Verify = lazy(() => import('@/pages/Verify'));
const Leaderboard = lazy(() => import('@/pages/Leaderboard'));
const Benchmark = lazy(() => import('@/pages/Benchmark'));
const Playground = lazy(() => import('@/pages/Playground'));
const Badge = lazy(() => import('@/pages/Badge'));
const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const OAuthConsent = lazy(() => import('@/pages/OAuthConsent'));
const About = lazy(() => import('@/pages/About'));
const Contact = lazy(() => import('@/pages/Contact'));
const WarrantSpec = lazy(() => import('@/pages/WarrantSpec'));
const Scorecard = lazy(() => import('@/pages/Scorecard'));
const Embed = lazy(() => import('@/pages/Embed'));
const EmbedBadge = lazy(() => import('@/pages/EmbedBadge'));
const Registry = lazy(() => import('@/pages/Registry'));
const Methodology = lazy(() => import('@/pages/Methodology'));
const Extension = lazy(() => import('@/pages/Extension'));
const Grounding = lazy(() => import('@/pages/Grounding'));
const Analytics = lazy(() => import('@/pages/Analytics'));
const Integrations = lazy(() => import('@/pages/Integrations'));
const Sdk = lazy(() => import('@/pages/Sdk'));
const Batch = lazy(() => import('@/pages/Batch'));
const Evidence = lazy(() => import('@/pages/Evidence'));
const HallOfFame = lazy(() => import('@/pages/HallOfFame'));
const Compare = lazy(() => import('@/pages/Compare'));
const ApiUsage = lazy(() => import('@/pages/ApiUsage'));
const DeveloperKeys = lazy(() => import('@/pages/DeveloperKeys'));
const RedTeamArena = lazy(() => import('@/pages/RedTeamArena'));
const MultiModelCompare = lazy(() => import('@/pages/MultiModelCompare'));
const GitHubAction = lazy(() => import('@/pages/GitHubAction'));
const GitHubPrVerify = lazy(() => import('@/pages/GitHubPrVerify'));
const Claims = lazy(() => import('@/pages/Claims'));
const PublicClaims = lazy(() => import('@/pages/PublicClaims'));
const Terms = lazy(() => import('@/pages/Terms'));
const Privacy = lazy(() => import('@/pages/Privacy'));
const CompetitiveMatrix = lazy(() => import('@/pages/CompetitiveMatrix'));
const WhyAether = lazy(() => import('@/pages/WhyAether'));
const MoatAnalysis = lazy(() => import('@/pages/MoatAnalysis'));
const Roadmap = lazy(() => import('@/pages/Roadmap'));
const MonthlyReport = lazy(() => import('@/pages/MonthlyReport'));
const WarrantVerifier = lazy(() => import('@/pages/WarrantVerifier'));
const WarrantProof = lazy(() => import('@/pages/WarrantProof'));
const FastPath = lazy(() => import('@/pages/FastPath'));
const PitchDeck = lazy(() => import('@/pages/PitchDeck'));
const DomainBenchmarks = lazy(() => import('@/pages/DomainBenchmarks'));
const EnterpriseIntegrations = lazy(() => import('@/pages/EnterpriseIntegrations'));
const VerificationHistory = lazy(() => import('@/pages/VerificationHistory'));
const CostAnalysis = lazy(() => import('@/pages/CostAnalysis'));
const Subscribers = lazy(() => import('@/pages/Subscribers'));
const OwnerDashboard = lazy(() => import('@/pages/OwnerDashboard'));
const TribunalLiftAssistant = lazy(() => import('@/pages/TribunalLiftAssistant'));
const CorrectionExplainer = lazy(() => import('@/pages/CorrectionExplainer'));
const VerificationHistoryAssistant = lazy(() => import('@/pages/VerificationHistoryAssistant'));
const IntegrationSupport = lazy(() => import('@/pages/IntegrationSupport'));
const Enterprise = lazy(() => import('@/pages/Enterprise'));
const TrustCenterHub = lazy(() => import('@/pages/TrustCenterHub'));
const DeveloperHub = lazy(() => import('@/pages/DeveloperHub'));
const PortalHub = lazy(() => import('@/pages/PortalHub'));
const Showcase = lazy(() => import('@/pages/Showcase'));
import ProtectedRoute from '@/components/ProtectedRoute';
import HonestEmpty from '@/components/aether/HonestEmpty';

// ── Public cosmos experience ────────────────────────────────────────────────────────
// The 3D evidence lens (/cosmos), the proof theater (/proof) and the live tribunal feed
// (/live). All three sit OUTSIDE ProtectedRoute on purpose: the proof is the pitch, so a
// stranger with a link has to be able to watch it work. /warrant-proof is untouched.
//
// These three pages are authored by sibling missions in this phase, so they may not be on
// disk yet. A bare `import('@/pages/Cosmos')` would hard-fail the whole build until the
// moment they land, so they resolve through a Vite glob instead: the glob compiles to an
// empty map when a file is absent (no build error) and picks up the real page the instant
// it appears — no second edit to this file, which matters because routing has a single
// owner this phase. Each route still gets its own lazy() chunk, exactly like every other
// route above.
const cosmosPages = import.meta.glob('/src/pages/{Cosmos,ProofTheater,LiveTribunal}.jsx');

// The fallback is an honest empty state, never a blank screen and never a mock that could
// be mistaken for the real experience — it says what is missing and where to go instead.
function RouteNotBuilt({ title, reason }) {
  return (
    <div className="min-h-screen bg-[#070A0F] px-6 py-24">
      <div className="mx-auto max-w-xl">
        <HonestEmpty
          title={title}
          reason={reason}
          state="unknown"
          action={{ label: 'Back to Aether', to: '/' }}
        />
      </div>
    </div>
  );
}

const lazyCosmosPage = (name, title, reason) => lazy(async () => {
  const entry = Object.entries(cosmosPages).find(([path]) => path.endsWith(`/${name}.jsx`));
  if (entry) return entry[1]();
  return { default: () => <RouteNotBuilt title={title} reason={reason} /> };
});

const Cosmos = lazyCosmosPage(
  'Cosmos',
  'The cosmos view has not shipped yet',
  'This route is reserved for the 3D evidence lens. It is not rendering an empty universe — the page itself is still being built, so there is nothing here to mistake for a real one.',
);
const ProofTheater = lazyCosmosPage(
  'ProofTheater',
  'The proof theater has not shipped yet',
  'This route is reserved for the step-by-step warrant walkthrough. Until it lands, the signed proof for any warrant is already viewable on the warrant proof page.',
);
const LiveTribunal = lazyCosmosPage(
  'LiveTribunal',
  'The live tribunal has not shipped yet',
  'This route is reserved for the streaming verification feed. Nothing is being hidden — the page has simply not been built, so no feed is claimed to exist.',
);

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();
  const location = useLocation();
  const stackRef = useRef([]);
  const dirRef = useRef(1);
  const lastPath = useRef(location.pathname);
  if (lastPath.current !== location.pathname) {
    const idx = stackRef.current.indexOf(location.pathname);
    if (idx === -1) {
      stackRef.current.push(location.pathname);
      dirRef.current = 1;
    } else if (idx < stackRef.current.length - 1) {
      stackRef.current = stackRef.current.slice(0, idx + 1);
      dirRef.current = -1;
    }
    lastPath.current = location.pathname;
  }
  const dir = dirRef.current;
  const isMobile = useIsMobile();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <AnimatePresence mode="wait" custom={dir}>
      <motion.div
        key={location.pathname}
        custom={dir}
        initial="enter"
        animate="center"
        exit="exit"
        variants={isMobile ? {
          enter: (d) => ({ opacity: 0, x: d > 0 ? 60 : -60 }),
          center: { opacity: 1, x: 0 },
          exit: (d) => ({ opacity: 0, x: d > 0 ? -60 : 60 }),
        } : {
          enter: { opacity: 1, x: 0 },
          center: { opacity: 1, x: 0 },
          exit: { opacity: 1, x: 0 },
        }}
        transition={isMobile ? { duration: 0.22, ease: 'easeInOut' } : { duration: 0 }}
      >
      <Suspense fallback={<div className="fixed inset-0 flex items-center justify-center bg-[#070A0F]"><div className="w-8 h-8 border-2 border-white/20 border-t-emerald-400 rounded-full animate-spin" /></div>}>
      <Routes location={location}>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/oauth/consent" element={<OAuthConsent />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/api-docs" element={<ApiDocs />} />
      <Route path="/mcp" element={<McpServer />} />
      <Route path="/verify/:id" element={<Verify />} />
      <Route path="/leaderboard" element={<Showcase />} />
      <Route path="/benchmark" element={<Benchmark />} />
      <Route path="/playground" element={<Playground />} />
      <Route path="/badge/:id" element={<Badge />} />
      <Route path="/about" element={<About />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/warrant-spec" element={<WarrantSpec />} />
      <Route path="/scorecard/:id" element={<Scorecard />} />
      <Route path="/embed" element={<Embed />} />
      <Route path="/embed/badge/:id" element={<EmbedBadge />} />
      <Route path="/registry" element={<Registry />} />
      <Route path="/methodology" element={<Methodology />} />
      <Route path="/extension" element={<Extension />} />
      <Route path="/hall-of-fame" element={<HallOfFame />} />
      <Route path="/compare" element={<Compare />} />
      <Route path="/arena" element={<RedTeamArena />} />
      <Route path="/multi-model" element={<MultiModelCompare />} />
      <Route path="/github-action" element={<GitHubAction />} />
      <Route path="/github-pr-verify" element={<GitHubPrVerify />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/competitive-matrix" element={<CompetitiveMatrix />} />
      <Route path="/why-aether" element={<WhyAether />} />
      <Route path="/moat" element={<MoatAnalysis />} />
      <Route path="/roadmap" element={<Roadmap />} />
      <Route path="/monthly-report" element={<MonthlyReport />} />
      <Route path="/warrant-verifier" element={<WarrantVerifier />} />
      <Route path="/warrant-proof" element={<WarrantProof />} />
      <Route path="/cosmos" element={<Cosmos />} />
      <Route path="/proof" element={<ProofTheater />} />
      <Route path="/live" element={<LiveTribunal />} />
      <Route path="/public/claims" element={<PublicClaims />} />
      <Route path="/fast-path" element={<FastPath />} />
      <Route path="/pitch" element={<PitchDeck />} />
      <Route path="/domain-benchmarks" element={<DomainBenchmarks />} />
      <Route path="/enterprise-integrations" element={<EnterpriseIntegrations />} />
      <Route path="/" element={<Landing />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route path="/console" element={<AskHub />} />
        <Route path="/setup" element={<GettingStarted />} />
        <Route path="/health" element={<Health />} />
        <Route path="/governance" element={<Governance />} />
        <Route path="/collective" element={<Collective />} />
        <Route path="/bench" element={<Bench />} />
        <Route path="/bench/model/:model" element={<ModelProfile />} />
        <Route path="/drift" element={<ModelDrift />} />
        <Route path="/lineage" element={<Lineage />} />
        <Route path="/systems" element={<Systems />} />
        <Route path="/trust-center" element={<TrustCenterHub />} />
        <Route path="/portal" element={<PortalHub />} />
        <Route path="/guide" element={<Guide />} />
        <Route path="/upgrade" element={<UpgradeQueue />} />
        <Route path="/explore" element={<Navigate to="/console" replace />} />
        <Route path="/enterprise" element={<Enterprise />} />
        <Route path="/telemetry" element={<Telemetry />} />
        <Route path="/report" element={<Report />} />
        <Route path="/grounding" element={<Grounding />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/integrations" element={<Integrations />} />
        <Route path="/sdk" element={<Sdk />} />
        <Route path="/batch" element={<Batch />} />
        <Route path="/evidence" element={<Evidence />} />
        <Route path="/api-usage" element={<ApiUsage />} />
        <Route path="/developer-keys" element={<DeveloperKeys />} />
        <Route path="/verification-history" element={<VerificationHistory />} />
        <Route path="/cost-analysis" element={<CostAnalysis />} />
        <Route path="/subscribers" element={<Subscribers />} />
        <Route path="/owner" element={<OwnerDashboard />} />
        <Route path="/tribunal-lift" element={<TribunalLiftAssistant />} />
        <Route path="/correction-explainer" element={<CorrectionExplainer />} />
        <Route path="/verification-assistant" element={<VerificationHistoryAssistant />} />
        <Route path="/integration-support" element={<IntegrationSupport />} />
        <Route path="/developer" element={<DeveloperHub />} />
        <Route path="/claims" element={<Claims />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
      </Routes>
      </Suspense>
      </motion.div>
    </AnimatePresence>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App