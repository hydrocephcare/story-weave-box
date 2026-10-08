import { Suspense, lazy } from "react";
import RailLayout from "@/components/RailLayout";
import SearchGate from "@/components/SearchGate";
import UpdateNotifier from "@/components/UpdateNotifier";
import ReminderWatcher from "@/components/ReminderWatcher";
import AiFailureWatcher from "@/components/AiFailureWatcher";
import AIGate from "@/components/ai/AIGate";
import AIPill from "@/components/ai/AIPill";
import AnnouncementBar from "@/components/AnnouncementBar";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import Navbar from "@/components/Navbar";
import SiteFooter from "@/components/SiteFooter";
import ScrollToTop from "@/components/ScrollToTop";
import ReturnToNote from "@/components/ReturnToNote";
import { ScrollProgressBar, BackToTopButton } from "@/components/ScrollFX";
import ContentProtection from "@/components/ContentProtection";
import PurchaseResume from "@/components/PurchaseResume";
import { Loader2 } from "lucide-react";
import RouteErrorBoundary from "@/components/RouteErrorBoundary";
import LearnerProfileGate from "@/components/LearnerProfileGate";
import { AdminRoute, SignedInRoute, StudentRoute } from "@/components/AccessRoute";

const Index = lazy(() => import("./pages/Index"));
const Brand = lazy(() => import("./pages/Brand"));
const NewNotes = lazy(() => import("./pages/NewNotes"));
const Timetable2026 = lazy(() => import("./pages/Timetable2026"));
const Blog = lazy(() => import("./pages/Blog"));
const BlogPost = lazy(() => import("./pages/BlogPost"));
const Flashcards = lazy(() => import("./pages/Flashcards"));
const FlashcardStudy = lazy(() => import("./pages/FlashcardStudy"));
const Exams = lazy(() => import("./pages/Exams"));
const ExamStart = lazy(() => import("./pages/ExamStart"));
const AdminEditor = lazy(() => import("./pages/AdminEditor"));
const Stories = lazy(() => import("./pages/Stories"));
const StoryRead = lazy(() => import("./pages/StoryRead"));
const Essays = lazy(() => import("./pages/Essays"));
const EssayStudy = lazy(() => import("./pages/EssayStudy"));
const Login = lazy(() => import("./pages/Login"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const Account = lazy(() => import("./pages/Account"));
const Admin = lazy(() => import("./pages/Admin"));
const SourceLibrary = lazy(() => import("./pages/SourceLibrary"));
const YearHub = lazy(() => import("./pages/YearHub"));
const Library = lazy(() => import("./pages/Library"));
const LegacyLibraryRedirect = lazy(() => import("./pages/LegacyLibraryRedirect"));
const CourseOutlines = lazy(() => import("./pages/CourseOutlines"));
const YearTimetable = lazy(() => import("./pages/YearTimetable"));
const UnitPage = lazy(() => import("./pages/UnitPage"));
const MyRevision = lazy(() => import("./pages/MyRevision"));
const RevisionPlanner = lazy(() => import("./pages/RevisionPlanner"));
const RevisionIndex = lazy(() => import("./pages/RevisionIndex"));
const SmartRevision = lazy(() => import("./pages/SmartRevision"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const StudyMap = lazy(() => import("./pages/StudyMap"));
const ClinicalHub = lazy(() => import("./pages/ClinicalHub"));
const ClinicalCase = lazy(() => import("./pages/ClinicalCase"));
const ClinicalPractice = lazy(() => import("./pages/ClinicalPractice"));
const ClinicalLab = lazy(() => import("./pages/ClinicalLab"));
const Pharmacology = lazy(() => import("./pages/Pharmacology"));
const MustKnows = lazy(() => import("./pages/MustKnows"));
const DailyDose = lazy(() => import("./pages/DailyDose"));
const Books = lazy(() => import("./pages/Books"));
const StaticNote = lazy(() => import("./pages/StaticNote"));
const StaticNotesIndex = lazy(() => import("./pages/StaticNotesIndex"));
const PastPapers = lazy(() => import("./pages/PastPapers"));
const GlobalSearch = lazy(() => import("./pages/GlobalSearch"));
const StudySystemAdmin = lazy(() => import("./pages/StudySystemAdmin"));
const CategoryManager = lazy(() => import("./pages/CategoryManager"));
const About = lazy(() => import("./pages/About"));
const Contests = lazy(() => import("./pages/Contests"));
const ContestBriefing = lazy(() => import("./pages/ContestBriefing"));
const ContestRegistration = lazy(() => import("./pages/ContestRegistration"));
const ContestLobby = lazy(() => import("./pages/ContestLobby"));
const ContestRound = lazy(() => import("./pages/ContestRound"));
const ContestAdmin = lazy(() => import("./pages/ContestAdmin"));
const ContestSetup = lazy(() => import("./pages/ContestSetup"));
const ContestQuestionAdmin = lazy(() => import("./pages/ContestQuestionAdmin"));
const ContestOperations = lazy(() => import("./pages/ContestOperations"));
const ContestLeaderboard = lazy(() => import("./pages/ContestLeaderboard"));
const ContestRehearsal = lazy(() => import("./pages/ContestRehearsal"));
const ContestProgress = lazy(() => import("./pages/ContestProgress"));
const ContestCertificate = lazy(() => import("./pages/ContestCertificate"));
const ContestAppealsAdmin = lazy(() => import("./pages/ContestAppealsAdmin"));
const AppDownload = lazy(() => import("./pages/AppDownload"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Avoid refetching large Supabase payloads every time a component remounts.
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});

const RouteLoader = () => (
  <div className="flex min-h-[60vh] items-center justify-center">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

const AnimatedRoutes = () => {
  const location = useLocation();
  return (
    <RouteErrorBoundary key={location.pathname}>
      <main className="min-h-[65vh]">
        <Suspense fallback={<RouteLoader />}>
          <Routes location={location}>
            <Route path="/" element={<Index />} />
            <Route path="/timetable-2026" element={<StudentRoute what="The timetable"><Timetable2026 /></StudentRoute>} />
            <Route path="/library/:year/*" element={<RailLayout><Library /></RailLayout>} />
            <Route path="/year-1-library" element={<LegacyLibraryRedirect slug="year-1" />} />
            <Route path="/year-2-library" element={<LegacyLibraryRedirect slug="year-2" />} />
            <Route path="/year-3-library" element={<LegacyLibraryRedirect slug="year-3" />} />
            <Route path="/year-4-library" element={<LegacyLibraryRedirect slug="year-4" />} />
            <Route path="/course-outlines" element={<RailLayout><CourseOutlines /></RailLayout>} />
            <Route path="/timetable/:year" element={<StudentRoute what="The timetable"><RailLayout><YearTimetable /></RailLayout></StudentRoute>} />
            <Route path="/timetable" element={<Navigate to="/timetable/year-1" replace />} />
            <Route path="/course-outlines/:dept" element={<RailLayout><CourseOutlines /></RailLayout>} />
            <Route path="/year/:yearNumber" element={<RailLayout><YearHub /></RailLayout>} />
            <Route path="/year/:yearNumber/unit/:unitSlug" element={<UnitPage />} />
            <Route path="/my-revision" element={<SignedInRoute><MyRevision /></SignedInRoute>} />
            <Route path="/revision-planner" element={<SignedInRoute><RevisionPlanner /></SignedInRoute>} />
            <Route path="/supplementary-revision" element={<Navigate to="/revision-index" replace />} />
            <Route path="/revision-index" element={<RevisionIndex />} />
            <Route path="/revise" element={<RailLayout><SmartRevision /></RailLayout>} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/study-map" element={<RailLayout><StudyMap /></RailLayout>} />
            <Route path="/clinical" element={<ClinicalHub />} />
            <Route path="/clinical/case/:id" element={<ClinicalCase />} />
            <Route path="/clinical/consultant" element={<ClinicalPractice />} />
            <Route path="/clinical/reason" element={<ClinicalPractice />} />
            <Route path="/clinical/cards" element={<ClinicalPractice />} />
            <Route path="/clinical/stations" element={<ClinicalLab />} />
            <Route path="/clinical/stations/:id" element={<ClinicalLab />} />
            <Route path="/clinical/why" element={<ClinicalLab />} />
            <Route path="/clinical/why/:id" element={<ClinicalLab />} />
            <Route path="/clinical/traps" element={<ClinicalLab />} />
            <Route path="/clinical/drugs" element={<ClinicalLab />} />
            <Route path="/clinical/drugs/:id" element={<ClinicalLab />} />
            <Route path="/clinical/findings" element={<ClinicalLab />} />
            <Route path="/clinical/quiz" element={<ClinicalLab />} />
            <Route path="/clinical/tools" element={<ClinicalLab />} />
            <Route path="/clinical/osce" element={<ClinicalLab />} />
            <Route path="/clinical/counsel" element={<ClinicalLab />} />
            <Route path="/clinical/counsel/:id" element={<ClinicalLab />} />
            <Route path="/clinical/mistakes" element={<ClinicalLab />} />
            <Route path="/pharmacology" element={<Pharmacology />} />
            <Route path="/pharmacology/drug/:id" element={<Pharmacology />} />
            <Route path="/must-knows" element={<MustKnows />} />
            <Route path="/must-knows/:unit" element={<MustKnows />} />
            <Route path="/daily" element={<DailyDose />} />
            <Route path="/papers" element={<PastPapers />} />
            <Route path="/brand" element={<Brand />} />
            <Route path="/new-notes" element={<RailLayout><NewNotes /></RailLayout>} />
            <Route path="/ai" element={<AIPage />} />
            <Route path="/notes" element={<StaticNotesIndex />} />
            <Route path="/notes/:slug" element={<StaticNote />} />
            <Route path="/books" element={<StudentRoute what="Books"><Books /></StudentRoute>} />
            <Route path="/books/:shelf" element={<StudentRoute what="Books"><Books /></StudentRoute>} />
            <Route path="/books/:shelf/:subject" element={<StudentRoute what="Books"><Books /></StudentRoute>} />
            <Route path="/study-map/:system" element={<RailLayout><StudyMap /></RailLayout>} />
            <Route path="/search" element={<RailLayout><GlobalSearch /></RailLayout>} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogPost />} />
            <Route path="/flashcards" element={<RailLayout><Flashcards /></RailLayout>} />
            <Route path="/flashcards/:id" element={<FlashcardStudy />} />
            <Route path="/mcqs" element={<RailLayout><Exams /></RailLayout>} />
            <Route path="/mcqs/:id" element={<ExamStart />} />
            <Route path="/exams" element={<RailLayout><Exams /></RailLayout>} />
            <Route path="/exams/:id/start" element={<ExamStart />} />
            <Route path="/contests" element={<RailLayout><Contests /></RailLayout>} />
            <Route path="/contests/:slug/briefing" element={<ContestBriefing />} />
            <Route path="/contests/:slug/register" element={<SignedInRoute><ContestRegistration /></SignedInRoute>} />
            <Route path="/contests/:slug/lobby" element={<SignedInRoute><ContestLobby /></SignedInRoute>} />
            <Route path="/contests/:slug/round/:roundId" element={<SignedInRoute><ContestRound /></SignedInRoute>} />
            <Route path="/contests/:slug/leaderboard" element={<ContestLeaderboard />} />
            <Route path="/contests/:slug/progress" element={<SignedInRoute><ContestProgress /></SignedInRoute>} />
            <Route path="/contests/:slug/certificate/:attemptId" element={<SignedInRoute><ContestCertificate /></SignedInRoute>} />
            <Route path="/admin/editor" element={<AdminRoute><AdminEditor /></AdminRoute>} />
            <Route path="/admin/categories" element={<AdminRoute><CategoryManager /></AdminRoute>} />
            <Route path="/admin/study-system" element={<AdminRoute><StudySystemAdmin /></AdminRoute>} />
            <Route path="/admin/contests" element={<AdminRoute><ContestAdmin /></AdminRoute>} />
            <Route path="/admin/contests/setup" element={<AdminRoute><ContestSetup /></AdminRoute>} />
            <Route path="/admin/contests/questions" element={<AdminRoute><ContestQuestionAdmin /></AdminRoute>} />
            <Route path="/admin/contests/operations" element={<AdminRoute><ContestOperations /></AdminRoute>} />
            <Route path="/admin/contests/rehearsal" element={<AdminRoute><ContestRehearsal /></AdminRoute>} />
            <Route path="/admin/contests/appeals" element={<AdminRoute><ContestAppealsAdmin /></AdminRoute>} />
            <Route path="/stories" element={<RailLayout><Stories /></RailLayout>} />
            <Route path="/stories/:id" element={<StoryRead />} />
            <Route path="/submit-story" element={<Navigate to="/stories?write=1" replace />} />
            <Route path="/essays" element={<RailLayout><Essays /></RailLayout>} />
            <Route path="/essays/:slug" element={<EssayStudy />} />
            <Route path="/login" element={<Login />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/account" element={<SignedInRoute><Account /></SignedInRoute>} />
            <Route path="/admin/payments" element={<AdminRoute><Navigate to="/admin#payments" replace /></AdminRoute>} />
            <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
            <Route path="/admin/unedited-uploads" element={<AdminRoute><Navigate to="/source-library" replace /></AdminRoute>} />
            <Route path="/unedited-uploads" element={<AdminRoute><Navigate to="/source-library" replace /></AdminRoute>} />
            <Route path="/source-library" element={<AdminRoute><SourceLibrary /></AdminRoute>} />
            <Route path="/source-library/:slug" element={<AdminRoute><SourceLibrary /></AdminRoute>} />
            <Route path="/about" element={<About />} />
            <Route path="/download-app" element={<AppDownload />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
    </RouteErrorBoundary>
  );
};

const AIPage = lazy(() => import("@/pages/OmpathAIPage"));

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <ScrollToTop />
            <ReturnToNote />
            <ScrollProgressBar />
            <BackToTopButton />
            <ContentProtection />
            <PurchaseResume />
            <LearnerProfileGate />
            <AnnouncementBar />
            <SearchGate />
            <UpdateNotifier />
            <ReminderWatcher />
            <AiFailureWatcher />
            <AIGate />
            <AIPill />
            <Navbar />
            <AnimatedRoutes />
            <SiteFooter />
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
