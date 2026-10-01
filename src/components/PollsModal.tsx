import React, { useState } from 'react';
import { Pool, PollItem, PollOption, User } from '../types';
import { Vote, X, Plus, Check, Edit2, Trash2, Lock, Unlock, Trophy, Trash } from 'lucide-react';

interface PollsModalProps {
  pool: Pool;
  polls: PollItem[];
  activeUser: User;
  onClose: () => void;
  onVote: (pollId: string, optionId?: string, userId?: string, writeInOption?: string) => void;
  onCreatePoll: (title: string, options: string[], allowWriteIn?: boolean) => void;
  onUpdatePoll?: (pollId: string, updates: { title?: string; status?: 'active' | 'closed'; options?: any[] }) => void;
  onDeletePoll?: (pollId: string) => void;
}

export const PollsModal: React.FC<PollsModalProps> = ({
  pool,
  polls,
  activeUser,
  onClose,
  onVote,
  onCreatePoll,
  onUpdatePoll,
  onDeletePoll,
}) => {
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newOptions, setNewOptions] = useState<string[]>(['', '']);
  const [allowWriteIn, setAllowWriteIn] = useState(true);

  // Write-in per poll state
  const [writeInText, setWriteInText] = useState<{ [pollId: string]: string }>({});
  const [showWriteInForPoll, setShowWriteInForPoll] = useState<{ [pollId: string]: boolean }>({});

  // Editing state
  const [editingPollId, setEditingPollId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [deletingPollId, setDeletingPollId] = useState<string | null>(null);

  const poolPolls = polls.filter((p) => (p.poolId || (p as any).pool_id) === pool.id);

  // Check if current user has management permissions (creator, pool champion/admin, or superadmin)
  const isManager = (poll: PollItem) => {
    const userMember = pool.members?.find((m) => m.id === activeUser.id);
    const role = userMember?.role || activeUser.role;
    const isPoolAdmin = role === 'champion' || role === 'admin' || pool.championId === activeUser.id;
    const isSuperAdmin = (activeUser as any).systemRole === 'superadmin' || (activeUser as any).systemRole === 'admin';
    const isCreator = poll.createdBy === activeUser.name || (poll as any).created_by === activeUser.name || (poll as any).createdBy === activeUser.id || (poll as any).created_by === activeUser.id;
    return isPoolAdmin || isSuperAdmin || isCreator;
  };

  const handleAddOptionField = () => {
    setNewOptions(prev => [...prev, '']);
  };

  const handleOptionChange = (idx: number, val: string) => {
    setNewOptions(prev => {
      const copy = [...prev];
      copy[idx] = val;
      return copy;
    });
  };

  const handleRemoveOptionField = (idx: number) => {
    if (newOptions.length <= 2) return;
    setNewOptions(prev => prev.filter((_, i) => i !== idx));
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = newTitle.trim();
    const validOpts = newOptions.map(o => o.trim()).filter(Boolean);
    if (!cleanTitle || validOpts.length < 2) return;

    onCreatePoll(cleanTitle, validOpts, allowWriteIn);
    setShowCreate(false);
    setNewTitle('');
    setNewOptions(['', '']);
    setAllowWriteIn(true);
  };

  const handleWriteInSubmit = (pollId: string, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = (writeInText[pollId] || '').trim();
    if (!text) return;
    onVote(pollId, undefined, activeUser.id, text);
    setWriteInText(prev => ({ ...prev, [pollId]: '' }));
    setShowWriteInForPoll(prev => ({ ...prev, [pollId]: false }));
  };

  const startEditing = (poll: PollItem) => {
    setEditingPollId(poll.id);
    setEditTitle(poll.title);
  };

  const handleSaveEdit = (pollId: string) => {
    if (!editTitle.trim()) return;
    if (onUpdatePoll) {
      onUpdatePoll(pollId, { title: editTitle.trim() });
    }
    setEditingPollId(null);
  };

  const handleToggleStatus = (poll: PollItem) => {
    if (!onUpdatePoll) return;
    const isCurrentlyClosed = poll.status === 'closed' || (poll as any).active === 0 || (poll as any).active === false;
    const nextStatus = isCurrentlyClosed ? 'active' : 'closed';
    onUpdatePoll(poll.id, { status: nextStatus });
  };

  const handleDeleteConfirm = (pollId: string) => {
    if (onDeletePoll) {
      onDeletePoll(pollId);
    }
    setDeletingPollId(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#2D2D2D]/40 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white border border-[#E0DAD1] rounded-xl max-w-lg w-full p-6 text-[#2D2D2D] shadow-xl relative my-8 space-y-5">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#EDE8E0]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[#FDF0EC] text-[#E8694A]">
              <Vote className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#2D2D2D]">Consumables Team Polls</h2>
              <p className="text-xs text-[#6B6B6B]">{pool.name}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#F0EBE3] transition"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {showCreate ? (
          <form onSubmit={handleCreateSubmit} className="space-y-3.5 bg-[#F0EBE3] p-4 rounded-lg border border-[#E0DAD1]">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-[#2D2D2D]">
                Create New Team Poll
              </h3>
              <span className="text-[10px] text-[#6B6B6B]">At least 2 options required</span>
            </div>

            <input
              type="text"
              required
              placeholder="Poll Question e.g. Which cold brew brand next?"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full bg-white border border-[#E0DAD1] text-[#2D2D2D] placeholder-[#9A9A9A] text-xs rounded-md p-2.5 focus:outline-none focus:border-[#E8694A]"
            />

            <div className="space-y-2">
              <label className="text-[11px] font-medium text-[#6B6B6B] block">Poll Choices</label>
              {newOptions.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    required={idx < 2}
                    placeholder={`Option ${idx + 1}`}
                    value={opt}
                    onChange={(e) => handleOptionChange(idx, e.target.value)}
                    className="flex-1 bg-white border border-[#E0DAD1] text-[#2D2D2D] placeholder-[#9A9A9A] text-xs rounded-md p-2 focus:outline-none focus:border-[#E8694A]"
                  />
                  {newOptions.length > 2 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveOptionField(idx)}
                      className="p-1.5 text-[#9A9A9A] hover:text-red-600 rounded hover:bg-white transition"
                      title="Remove option"
                    >
                      <Trash className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}

              <button
                type="button"
                onClick={handleAddOptionField}
                className="text-xs font-medium text-[#E8694A] hover:text-[#D45A3D] flex items-center gap-1 pt-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add another option</span>
              </button>
            </div>

            {/* Write-In Option Permission Toggle */}
            <div className="pt-2 border-t border-[#E0DAD1]/60">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allowWriteIn}
                  onChange={(e) => setAllowWriteIn(e.target.checked)}
                  className="rounded border-[#E0DAD1] text-[#E8694A] focus:ring-[#E8694A] h-3.5 w-3.5"
                />
                <span className="text-xs text-[#2D2D2D] font-medium">
                  Allow team members to submit write-in options
                </span>
              </label>
              <p className="text-[10px] text-[#6B6B6B] ml-5">
                Voters can suggest new items and cast their vote for their own write-in choice.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowCreate(false);
                  setNewTitle('');
                  setNewOptions(['', '']);
                }}
                className="w-1/3 py-2 rounded-full bg-transparent hover:bg-white text-[#2D2D2D] font-medium text-xs border border-[#E0DAD1]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="w-2/3 py-2 rounded-full bg-[#E8694A] hover:bg-[#D45A3D] text-white font-medium text-xs shadow-xs"
              >
                Launch Poll
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <button
              onClick={() => setShowCreate(true)}
              className="w-full py-2.5 rounded-full bg-[#F0EBE3] hover:bg-[#E8E2D9] border border-[#E0DAD1] text-[#2D2D2D] font-medium text-xs flex items-center justify-center gap-1.5 transition shadow-xs"
            >
              <Plus className="h-4 w-4 text-[#E8694A]" />
              <span>Create New Item Poll</span>
            </button>

            <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
              {poolPolls.length === 0 ? (
                <div className="text-center py-8 text-xs text-[#6B6B6B] bg-[#F0EBE3] rounded-lg border border-dashed border-[#E0DAD1]">
                  No active polls for {pool.name}. Create one above!
                </div>
              ) : (
                poolPolls.map((poll) => {
                  const isClosed = poll.status === 'closed' || (poll as any).active === 0 || (poll as any).active === false;
                  const canManage = isManager(poll);
                  const canToggleStatus = canManage || Boolean(pool.members?.some(m => m.id === activeUser.id));
                  const isEditing = editingPollId === poll.id;
                  const isDeleting = deletingPollId === poll.id;
                  const isWriteInAllowed = poll.allowWriteIn !== false;

                  const pollOptions: PollOption[] = Array.isArray(poll.options)
                    ? poll.options
                    : (typeof (poll as any).options === 'string'
                        ? (() => { try { return JSON.parse((poll as any).options); } catch { return []; } })()
                        : (typeof (poll as any).options_json === 'string'
                            ? (() => { try { return JSON.parse((poll as any).options_json); } catch { return []; } })()
                            : []));
                  const totalVotesInPoll = pollOptions.reduce((acc: number, c: PollOption) => acc + (c.votes?.length || 0), 0);
                  const maxVotes = Math.max(...pollOptions.map((o: PollOption) => o.votes?.length || 0), 0);

                  return (
                    <div
                      key={poll.id}
                      data-testid={`poll-card-${poll.id}`}
                      className={`p-4 rounded-lg border space-y-3 transition ${
                        isClosed ? 'bg-[#F9F7F4] border-[#E0DAD1] opacity-90' : 'bg-[#F0EBE3] border-[#E0DAD1]'
                      }`}
                    >
                      {/* Poll Title & Actions Bar */}
                      <div className="flex items-start justify-between gap-2">
                        {isEditing ? (
                          <div className="flex-1 space-y-2">
                            <input
                              type="text"
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              className="w-full bg-white border border-[#E8694A] text-xs font-semibold text-[#2D2D2D] rounded-md p-2 focus:outline-none"
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleSaveEdit(poll.id)}
                                className="px-3 py-1 bg-[#E8694A] hover:bg-[#D45A3D] text-white text-[11px] font-medium rounded-md"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingPollId(null)}
                                className="px-3 py-1 bg-white hover:bg-gray-100 text-[#2D2D2D] text-[11px] font-medium rounded-md border border-[#E0DAD1]"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-[#2D2D2D] text-sm">{poll.title}</h3>
                              <span
                                className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                                  isClosed
                                    ? 'bg-[#E0DAD1] text-[#6B6B6B]'
                                    : 'bg-[#FDF0EC] text-[#E8694A] border border-[#F5C7B8]'
                                }`}
                              >
                                {isClosed ? 'Closed' : 'Active'}
                              </span>
                              {isWriteInAllowed && !isClosed && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                                  Write-ins open
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-[#6B6B6B]">Created by {poll.createdBy}</span>
                          </div>
                        )}

                        {/* Poll Actions (Close/Reopen, Edit, Delete) */}
                        {!isEditing && (canToggleStatus || canManage) && (
                          <div className="flex items-center gap-1 shrink-0">
                            {canToggleStatus && (
                              <button
                                onClick={() => handleToggleStatus(poll)}
                                title={isClosed ? 'Reopen poll' : 'Close poll'}
                                aria-label={isClosed ? 'Reopen poll' : 'Close poll'}
                                className={`px-2 py-1 rounded text-xs font-medium border transition flex items-center gap-1 cursor-pointer ${
                                  isClosed
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                    : 'bg-white text-[#2D2D2D] border-[#E0DAD1] hover:bg-gray-100'
                                }`}
                              >
                                {isClosed ? (
                                  <>
                                    <Unlock className="h-3.5 w-3.5 text-emerald-600" />
                                    <span className="text-[10px]">Reopen</span>
                                  </>
                                ) : (
                                  <>
                                    <Lock className="h-3.5 w-3.5 text-amber-600" />
                                    <span className="text-[10px]">Close voting</span>
                                  </>
                                )}
                              </button>
                            )}
                            {canManage && (
                              <>
                                <button
                                  onClick={() => startEditing(poll)}
                                  title="Edit poll title"
                                  className="p-1 rounded text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-white transition"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => setDeletingPollId(poll.id)}
                                  title="Delete poll"
                                  className="p-1 rounded text-[#6B6B6B] hover:text-red-600 hover:bg-white transition"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Deletion confirmation bar */}
                      {isDeleting && (
                        <div className="p-2.5 bg-red-50 border border-red-200 rounded-md text-xs text-red-800 flex items-center justify-between">
                          <span>Delete this poll permanently?</span>
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => handleDeleteConfirm(poll.id)}
                              className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-[10px] font-medium"
                            >
                              Delete
                            </button>
                            <button
                              onClick={() => setDeletingPollId(null)}
                              className="px-2 py-1 bg-white hover:bg-gray-100 text-[#2D2D2D] rounded text-[10px] border border-gray-300"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Options & Votes List */}
                      <div className="space-y-2">
                        {pollOptions.map((opt: PollOption) => {
                          const hasVoted = Array.isArray(opt.votes) && opt.votes.some((v: any) => String(v) === String(activeUser.id));
                          const votesCount = opt.votes?.length || 0;
                          const pct = totalVotesInPoll > 0 ? Math.round((votesCount / totalVotesInPoll) * 100) : 0;
                          const isWinner = isClosed && maxVotes > 0 && votesCount === maxVotes;

                          return (
                            <button
                              key={opt.id}
                              disabled={isClosed}
                              onClick={() => onVote(poll.id, opt.id, activeUser.id)}
                              className={`w-full p-2.5 rounded-md border text-left transition relative overflow-hidden flex items-center justify-between ${
                                isClosed
                                  ? isWinner
                                    ? 'bg-amber-50/70 border-amber-300 ring-1 ring-amber-300'
                                    : 'bg-white border-[#E0DAD1] cursor-not-allowed opacity-80'
                                  : hasVoted
                                  ? 'bg-white border-[#E8694A] ring-1 ring-[#E8694A]'
                                  : 'bg-white border-[#E0DAD1] hover:border-[#E8694A]'
                              }`}
                            >
                              {/* Percentage Fill bar */}
                              <div
                                className={`absolute left-0 top-0 bottom-0 pointer-events-none transition-all ${
                                  isWinner ? 'bg-amber-100' : 'bg-[#FDF0EC]'
                                }`}
                                style={{ width: `${pct}%` }}
                              />

                              <div className="relative z-10 font-medium text-xs text-[#2D2D2D] flex items-center gap-2">
                                {isWinner && <Trophy className="h-3.5 w-3.5 text-amber-600" />}
                                {hasVoted && !isWinner && <Check className="h-3.5 w-3.5 text-[#E8694A]" />}
                                <span>{opt.name || (opt as any).text}</span>
                                {opt.isWriteIn && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-normal border border-amber-200">
                                    Write-in
                                  </span>
                                )}
                              </div>

                              <div className="relative z-10 font-mono-financial text-xs text-[#6B6B6B] flex items-center gap-1.5">
                                <span>{votesCount} {votesCount === 1 ? 'vote' : 'votes'}</span>
                                <span className="font-semibold">({pct}%)</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {/* Write-In Option Form / Button */}
                      {!isClosed && isWriteInAllowed && (
                        <div className="pt-1">
                          {!showWriteInForPoll[poll.id] ? (
                            <button
                              type="button"
                              onClick={() => setShowWriteInForPoll(prev => ({ ...prev, [poll.id]: true }))}
                              className="w-full py-2 px-3 rounded-md border border-dashed border-[#E0DAD1] hover:border-[#E8694A] text-left text-xs font-medium text-[#6B6B6B] hover:text-[#E8694A] bg-white/70 hover:bg-white transition flex items-center justify-between group"
                            >
                              <span className="flex items-center gap-1.5">
                                <Plus className="h-3.5 w-3.5 text-[#E8694A] group-hover:scale-110 transition" />
                                <span>Suggest write-in option...</span>
                              </span>
                              <span className="text-[10px] text-[#9A9A9A]">Add & vote</span>
                            </button>
                          ) : (
                            <form
                              onSubmit={(e) => handleWriteInSubmit(poll.id, e)}
                              className="p-2.5 bg-white rounded-md border border-[#E8694A]/40 space-y-2 animate-in fade-in"
                            >
                              <div className="flex items-center justify-between text-[11px] font-semibold text-[#2D2D2D]">
                                <span className="flex items-center gap-1.5">
                                  <Vote className="h-3 w-3 text-[#E8694A]" />
                                  Submit Write-In Choice
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setShowWriteInForPoll(prev => ({ ...prev, [poll.id]: false }))}
                                  className="text-[#9A9A9A] hover:text-[#2D2D2D] text-[10px]"
                                >
                                  Cancel
                                </button>
                              </div>
                              <div className="flex gap-1.5">
                                <input
                                  type="text"
                                  autoFocus
                                  placeholder="Type your custom option..."
                                  value={writeInText[poll.id] || ''}
                                  onChange={(e) => setWriteInText(prev => ({ ...prev, [poll.id]: e.target.value }))}
                                  className="flex-1 bg-[#F9F7F4] border border-[#E0DAD1] text-xs rounded-md px-2.5 py-1.5 text-[#2D2D2D] placeholder-[#9A9A9A] focus:outline-none focus:border-[#E8694A]"
                                />
                                <button
                                  type="submit"
                                  disabled={!writeInText[poll.id]?.trim()}
                                  className="px-3 py-1.5 bg-[#E8694A] hover:bg-[#D45A3D] disabled:opacity-50 text-white font-medium text-xs rounded-md transition shadow-xs shrink-0"
                                >
                                  Vote
                                </button>
                              </div>
                            </form>
                          )}
                        </div>
                      )}

                      {isClosed && (
                        <div className="text-[10px] text-[#6B6B6B] italic text-center pt-1">
                          Voting is closed for this poll.
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
