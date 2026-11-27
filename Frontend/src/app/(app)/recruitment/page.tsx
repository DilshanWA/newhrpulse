"use client";

import { Briefcase, CalendarClock, Plus, Users } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Empty, Field, Modal, PageHeader, Spinner, Stat, TableWrap, THead, Tabs } from "@/components/ui";
import type {
  CandidateStage, RecruitmentCandidate, RecruitmentEmploymentType, RecruitmentInterview,
  RecruitmentInterviewStatus, RecruitmentJob, RecruitmentJobStatus, RecruitmentMeetingType,
} from "@/domain/types";
import { useAsync } from "@/hooks/useAsync";
import { messageOf } from "@/lib/errors";
import { services } from "@/services";

type JobDraft = Pick<RecruitmentJob, "title" | "department" | "location" | "employmentType" | "description" | "requirements" | "status">;
type CandidateDraft = Pick<RecruitmentCandidate, "jobId" | "name" | "email" | "phone" | "source" | "notes">;
type InterviewDraft = Pick<RecruitmentInterview, "candidateId" | "interviewer" | "meetingType" | "notes"> & { scheduledAt: string };
type Section = "roles" | "candidates" | "interviews";

const EMPTY_JOB: JobDraft = {
  title: "", department: "", location: "", employmentType: "full_time", description: "", requirements: "", status: "open",
};
const stages: { id: CandidateStage; label: string }[] = [
  { id: "applied", label: "Applied" },
  { id: "screening", label: "Screening" },
  { id: "interview", label: "Interview" },
  { id: "offer", label: "Offer" },
  { id: "hired", label: "Hired" },
  { id: "rejected", label: "Rejected" },
];
const jobTypes: { id: RecruitmentEmploymentType; label: string }[] = [
  { id: "full_time", label: "Full time" },
  { id: "part_time", label: "Part time" },
  { id: "contract", label: "Contract" },
  { id: "internship", label: "Internship" },
];

const jobTone = (status: RecruitmentJobStatus) =>
  status === "open" ? "green" : status === "draft" ? "amber" : "slate";
const stageTone = (stage: CandidateStage) =>
  ({ applied: "blue", screening: "violet", interview: "amber", offer: "amber", hired: "green", rejected: "red" })[stage] as
    "blue" | "violet" | "amber" | "green" | "red";
const interviewTone = (status: RecruitmentInterviewStatus) =>
  status === "completed" ? "green" : status === "cancelled" ? "red" : "blue";

function dateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function RecruitmentPage() {
  const { data, loading, reload } = useAsync(async () => {
    const [jobs, candidates, interviews] = await Promise.all([
      services.recruitment.jobs(),
      services.recruitment.candidates(),
      services.recruitment.interviews(),
    ]);
    return { jobs, candidates, interviews };
  });
  const [section, setSection] = useState<Section>("roles");
  const [jobModal, setJobModal] = useState(false);
  const [editingJob, setEditingJob] = useState<RecruitmentJob>();
  const [jobDraft, setJobDraft] = useState<JobDraft>(EMPTY_JOB);
  const [candidateModal, setCandidateModal] = useState(false);
  const [candidateDraft, setCandidateDraft] = useState<CandidateDraft>({ jobId: "", name: "", email: "", phone: "", source: "", notes: "" });
  const [notesCandidate, setNotesCandidate] = useState<RecruitmentCandidate>();
  const [candidateNotes, setCandidateNotes] = useState("");
  const [interviewModal, setInterviewModal] = useState(false);
  const [interviewDraft, setInterviewDraft] = useState<InterviewDraft>({
    candidateId: "", interviewer: "", scheduledAt: "", meetingType: "video", notes: "",
  });
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string>();

  const jobs = data?.jobs ?? [];
  const candidates = data?.candidates ?? [];
  const interviews = data?.interviews ?? [];
  const openJobs = jobs.filter((job) => job.status === "open");
  const activeCandidates = candidates.filter((candidate) => candidate.stage !== "hired" && candidate.stage !== "rejected");
  const upcomingInterviews = interviews.filter((interview) =>
    interview.status === "scheduled" && new Date(interview.scheduledAt).getTime() >= Date.now(),
  );
  const filteredCandidates = candidates.filter((candidate) =>
    `${candidate.name} ${candidate.email} ${candidate.jobTitle} ${candidate.stage}`.toLowerCase().includes(search.toLowerCase()),
  );
  const eligibleCandidates = activeCandidates;

  async function runAction(action: () => Promise<unknown>) {
    setSaving(true);
    setActionError(undefined);
    try {
      await action();
      await reload();
      return true;
    } catch (error) {
      setActionError(messageOf(error));
      return false;
    } finally {
      setSaving(false);
    }
  }

  function openNewJob() {
    setEditingJob(undefined);
    setJobDraft(EMPTY_JOB);
    setActionError(undefined);
    setJobModal(true);
  }

  function openEditJob(job: RecruitmentJob) {
    setEditingJob(job);
    setJobDraft({
      title: job.title, department: job.department, location: job.location, employmentType: job.employmentType,
      description: job.description, requirements: job.requirements, status: job.status,
    });
    setActionError(undefined);
    setJobModal(true);
  }

  async function saveJob() {
    const saved = await runAction(() => editingJob
      ? services.recruitment.updateJob(editingJob.id, jobDraft)
      : services.recruitment.createJob(jobDraft));
    if (saved) setJobModal(false);
  }

  function openNewCandidate() {
    setCandidateDraft({ jobId: openJobs[0]?.id ?? "", name: "", email: "", phone: "", source: "", notes: "" });
    setActionError(undefined);
    setCandidateModal(true);
  }

  async function saveCandidate() {
    const saved = await runAction(() => services.recruitment.createCandidate(candidateDraft));
    if (saved) setCandidateModal(false);
  }

  async function saveCandidateNotes() {
    if (!notesCandidate) return;
    const saved = await runAction(() => services.recruitment.updateCandidate(notesCandidate.id, { notes: candidateNotes }));
    if (saved) setNotesCandidate(undefined);
  }

  async function changeStage(candidate: RecruitmentCandidate, stage: CandidateStage) {
    if (stage === candidate.stage) return;
    await runAction(() => services.recruitment.updateCandidate(candidate.id, { stage }));
  }

  function openInterview(candidate?: RecruitmentCandidate) {
    setInterviewDraft({
      candidateId: candidate?.id ?? eligibleCandidates[0]?.id ?? "",
      interviewer: "", scheduledAt: "", meetingType: "video", notes: "",
    });
    setActionError(undefined);
    setInterviewModal(true);
  }

  async function saveInterview() {
    if (!interviewDraft.scheduledAt) {
      setActionError("Choose an interview date and time.");
      return;
    }
    const scheduledAt = new Date(interviewDraft.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      setActionError("Choose a valid interview date and time.");
      return;
    }
    const saved = await runAction(() => services.recruitment.createInterview({
      ...interviewDraft, scheduledAt: scheduledAt.toISOString(),
    }));
    if (saved) setInterviewModal(false);
  }

  async function changeInterviewStatus(interview: RecruitmentInterview, status: RecruitmentInterviewStatus) {
    if (status === interview.status) return;
    await runAction(() => services.recruitment.updateInterview(interview.id, { status }));
  }

  const jobTabs = [
    { id: "roles" as const, label: `Roles (${jobs.length})` },
    { id: "candidates" as const, label: `Candidates (${candidates.length})` },
    { id: "interviews" as const, label: `Interviews (${interviews.length})` },
  ];

  return (
    <>
      <PageHeader
        title="Recruitment"
        subtitle="Post open roles, move candidates through the hiring process, and manage interviews."
        actions={<Button onClick={openNewJob}><Plus size={16} /> Post a role</Button>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Open roles" value={openJobs.length} icon={<Briefcase size={18} />} />
        <Stat label="Active candidates" value={activeCandidates.length} icon={<Users size={18} />} tone="violet" />
        <Stat label="Upcoming interviews" value={upcomingInterviews.length} icon={<CalendarClock size={18} />} tone="amber" />
        <Stat label="Hired" value={candidates.filter((candidate) => candidate.stage === "hired").length} tone="rose" />
      </div>

      <Tabs tabs={jobTabs} value={section} onChange={setSection} />
      {actionError && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{actionError}</p>}

      {loading ? <Spinner /> : section === "roles" ? (
        jobs.length === 0 ? <Empty text="No roles yet. Post an opening to start recruiting." /> : (
          <TableWrap>
            <THead cols={["Role", "Department", "Location", "Candidates", "Status", ""]} />
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="td">
                    <p className="font-medium">{job.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{jobTypes.find((type) => type.id === job.employmentType)?.label ?? job.employmentType}</p>
                  </td>
                  <td className="td">{job.department}</td>
                  <td className="td">{job.location}</td>
                  <td className="td">{candidates.filter((candidate) => candidate.jobId === job.id).length}</td>
                  <td className="td"><Badge tone={jobTone(job.status)}>{job.status}</Badge></td>
                  <td className="td text-right"><Button variant="secondary" size="sm" onClick={() => openEditJob(job)}>Edit role</Button></td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )
      ) : section === "candidates" ? (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <input className="input max-w-sm" aria-label="Search candidates" placeholder="Search candidates or roles" value={search} onChange={(event) => setSearch(event.target.value)} />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => openInterview()} disabled={!eligibleCandidates.length}>
                <CalendarClock size={16} /> Schedule interview
              </Button>
              <Button onClick={openNewCandidate} disabled={!openJobs.length}>
                <Plus size={16} /> Add candidate
              </Button>
            </div>
          </div>
          {!candidates.length ? <Empty text="No candidates yet. Add a candidate to an open role to begin." /> : (
            <TableWrap>
              <THead cols={["Candidate", "Role", "Stage", "Notes", "Actions"]} />
              <tbody>
                {filteredCandidates.map((candidate) => (
                  <tr key={candidate.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="td">
                      <p className="font-medium">{candidate.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{candidate.email}{candidate.phone ? ` · ${candidate.phone}` : ""}</p>
                    </td>
                    <td className="td">{candidate.jobTitle}</td>
                    <td className="td">
                      <select
                        className="input w-36 py-1.5"
                        aria-label={`Stage for ${candidate.name}`}
                        value={candidate.stage}
                        onChange={(event) => changeStage(candidate, event.target.value as CandidateStage)}
                      >
                        {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}
                      </select>
                      <span className="mt-1 block"><Badge tone={stageTone(candidate.stage)}>{candidate.stage}</Badge></span>
                    </td>
                    <td className="td max-w-56 truncate text-slate-500">{candidate.notes || "—"}</td>
                    <td className="td text-right">
                      <span className="inline-flex gap-2">
                        <Button variant="secondary" size="sm" onClick={() => { setNotesCandidate(candidate); setCandidateNotes(candidate.notes); setActionError(undefined); }}>Notes</Button>
                        {candidate.stage !== "hired" && candidate.stage !== "rejected" && (
                          <Button variant="secondary" size="sm" onClick={() => openInterview(candidate)}>Interview</Button>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </>
      ) : (
        <>
          <div className="mb-4 flex justify-end">
            <Button onClick={() => openInterview()} disabled={!eligibleCandidates.length}><Plus size={16} /> Schedule interview</Button>
          </div>
          {!interviews.length ? <Empty text="No interviews scheduled yet. Schedule one from a candidate profile." /> : (
            <TableWrap>
              <THead cols={["Candidate", "Role", "Date and time", "Interviewer", "Format", "Status"]} />
              <tbody>
                {interviews.map((interview) => (
                  <tr key={interview.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="td font-medium">{interview.candidateName}</td>
                    <td className="td">{interview.jobTitle}</td>
                    <td className="td">{dateTime(interview.scheduledAt)}</td>
                    <td className="td">{interview.interviewer}</td>
                    <td className="td capitalize">{interview.meetingType}</td>
                    <td className="td">
                      <select
                        className="input w-36 py-1.5"
                        aria-label={`Status for ${interview.candidateName}'s interview`}
                        value={interview.status}
                        onChange={(event) => changeInterviewStatus(interview, event.target.value as RecruitmentInterviewStatus)}
                      >
                        <option value="scheduled">Scheduled</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                      <span className="mt-1 block"><Badge tone={interviewTone(interview.status)}>{interview.status}</Badge></span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </>
      )}

      <Modal open={jobModal} onClose={() => setJobModal(false)} title={editingJob ? "Edit recruitment role" : "Post a recruitment role"} size="lg">
        <div className="space-y-3">
          {actionError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{actionError}</p>}
          <Field label="Job title"><input className="input" maxLength={160} value={jobDraft.title} onChange={(event) => setJobDraft({ ...jobDraft, title: event.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Department"><input className="input" maxLength={120} value={jobDraft.department} onChange={(event) => setJobDraft({ ...jobDraft, department: event.target.value })} /></Field>
            <Field label="Location"><input className="input" maxLength={160} value={jobDraft.location} onChange={(event) => setJobDraft({ ...jobDraft, location: event.target.value })} /></Field>
            <Field label="Employment type">
              <select className="input" value={jobDraft.employmentType} onChange={(event) => setJobDraft({ ...jobDraft, employmentType: event.target.value as RecruitmentEmploymentType })}>
                {jobTypes.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
              </select>
            </Field>
            <Field label="Posting status">
              <select className="input" value={jobDraft.status} onChange={(event) => setJobDraft({ ...jobDraft, status: event.target.value as RecruitmentJobStatus })}>
                <option value="open">Open</option><option value="draft">Draft</option><option value="closed">Closed</option>
              </select>
            </Field>
          </div>
          <Field label="Description"><textarea className="input min-h-24" value={jobDraft.description} onChange={(event) => setJobDraft({ ...jobDraft, description: event.target.value })} /></Field>
          <Field label="Requirements"><textarea className="input min-h-24" value={jobDraft.requirements} onChange={(event) => setJobDraft({ ...jobDraft, requirements: event.target.value })} /></Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setJobModal(false)}>Cancel</Button>
            <Button onClick={saveJob} disabled={saving || !jobDraft.title.trim() || !jobDraft.department.trim() || !jobDraft.location.trim()}>
              {saving ? "Saving…" : editingJob ? "Save changes" : "Post role"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={candidateModal} onClose={() => setCandidateModal(false)} title="Add candidate">
        <div className="space-y-3">
          {actionError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{actionError}</p>}
          <Field label="Open role">
            <select className="input" value={candidateDraft.jobId} onChange={(event) => setCandidateDraft({ ...candidateDraft, jobId: event.target.value })}>
              {openJobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
            </select>
          </Field>
          <Field label="Candidate name"><input className="input" maxLength={160} value={candidateDraft.name} onChange={(event) => setCandidateDraft({ ...candidateDraft, name: event.target.value })} /></Field>
          <Field label="Email"><input className="input" type="email" maxLength={254} value={candidateDraft.email} onChange={(event) => setCandidateDraft({ ...candidateDraft, email: event.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Phone"><input className="input" maxLength={40} value={candidateDraft.phone} onChange={(event) => setCandidateDraft({ ...candidateDraft, phone: event.target.value })} /></Field>
            <Field label="Source"><input className="input" maxLength={120} placeholder="Referral, job board…" value={candidateDraft.source} onChange={(event) => setCandidateDraft({ ...candidateDraft, source: event.target.value })} /></Field>
          </div>
          <Field label="Notes"><textarea className="input min-h-20" value={candidateDraft.notes} onChange={(event) => setCandidateDraft({ ...candidateDraft, notes: event.target.value })} /></Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setCandidateModal(false)}>Cancel</Button>
            <Button onClick={saveCandidate} disabled={saving || !candidateDraft.jobId || !candidateDraft.name.trim() || !candidateDraft.email.trim()}>
              {saving ? "Saving…" : "Add candidate"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!notesCandidate} onClose={() => setNotesCandidate(undefined)} title={`Notes${notesCandidate ? ` — ${notesCandidate.name}` : ""}`}>
        <div className="space-y-3">
          {actionError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{actionError}</p>}
          <Field label="Candidate notes"><textarea className="input min-h-32" value={candidateNotes} onChange={(event) => setCandidateNotes(event.target.value)} /></Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setNotesCandidate(undefined)}>Cancel</Button>
            <Button onClick={saveCandidateNotes} disabled={saving}>{saving ? "Saving…" : "Save notes"}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={interviewModal} onClose={() => setInterviewModal(false)} title="Schedule interview">
        <div className="space-y-3">
          {actionError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{actionError}</p>}
          <Field label="Candidate">
            <select className="input" value={interviewDraft.candidateId} onChange={(event) => setInterviewDraft({ ...interviewDraft, candidateId: event.target.value })}>
              {eligibleCandidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} — {candidate.jobTitle}</option>)}
            </select>
          </Field>
          <Field label="Date and time"><input className="input" type="datetime-local" value={interviewDraft.scheduledAt} onChange={(event) => setInterviewDraft({ ...interviewDraft, scheduledAt: event.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Interviewer"><input className="input" maxLength={160} value={interviewDraft.interviewer} onChange={(event) => setInterviewDraft({ ...interviewDraft, interviewer: event.target.value })} /></Field>
            <Field label="Format">
              <select className="input" value={interviewDraft.meetingType} onChange={(event) => setInterviewDraft({ ...interviewDraft, meetingType: event.target.value as RecruitmentMeetingType })}>
                <option value="video">Video</option><option value="phone">Phone</option><option value="onsite">On-site</option>
              </select>
            </Field>
          </div>
          <Field label="Interview notes"><textarea className="input min-h-20" value={interviewDraft.notes} onChange={(event) => setInterviewDraft({ ...interviewDraft, notes: event.target.value })} /></Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setInterviewModal(false)}>Cancel</Button>
            <Button onClick={saveInterview} disabled={saving || !interviewDraft.candidateId || !interviewDraft.interviewer.trim() || !interviewDraft.scheduledAt}>
              {saving ? "Saving…" : "Schedule interview"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
