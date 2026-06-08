import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, Heart, Share2, MapPin, Gift, Plus, X, Send, Store, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import { getDisplayName } from '../lib/localProfile';

type Post = {
  id: string;
  created_at: string;
  title: string;
  content: string;
  author_type: 'owner' | 'customer';
  likes_count: number;
  user_id?: string;
  author_name?: string;
  author_avatar?: string;
  author_store_name?: string;
  comments?: { count: number }[]; // 수량 가져오기 용도
};

type Comment = {
  id: string;
  post_id: string;
  user_id: string;
  author_name: string;
  author_avatar?: string;
  author_type: 'owner' | 'customer';
  author_store_name?: string;
  content: string;
  created_at: string;
};

const LOCAL_POSTS_KEY = 'naeil_local_posts';
const LOCAL_COMMENTS_KEY = 'naeil_local_comments';
const LOCAL_LIKES_KEY = 'naeil_local_likes';

const readJsonArray = <T,>(key: string): T[] => {
  try {
    const rawValue = localStorage.getItem(key);
    return rawValue ? JSON.parse(rawValue) : [];
  } catch {
    return [];
  }
};

const writeJsonArray = <T,>(key: string, value: T[]) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const readLocalPosts = () => readJsonArray<Post>(LOCAL_POSTS_KEY);
const writeLocalPosts = (posts: Post[]) => writeJsonArray(LOCAL_POSTS_KEY, posts);
const readLocalComments = () => readJsonArray<Comment>(LOCAL_COMMENTS_KEY);
const writeLocalComments = (comments: Comment[]) => writeJsonArray(LOCAL_COMMENTS_KEY, comments);
const readLocalLikes = (userId: string) => new Set(readJsonArray<string>(`${LOCAL_LIKES_KEY}_${userId}`));
const writeLocalLikes = (userId: string, likes: Set<string>) => writeJsonArray(`${LOCAL_LIKES_KEY}_${userId}`, [...likes]);

export default function Community() {
  const { user, userRole, storeName } = useAuthStore();
  const navigate = useNavigate();
  
  const [points] = useState(75);
  const [posts, setPosts] = useState<Post[]>([]);
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  
  // 글쓰기 모달
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 댓글 상태
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  const fetchPosts = async () => {
    try {
      const { data, error } = await supabase
        .from('posts')
        .select('*, comments(count)')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mergedPosts = [...(data || []), ...readLocalPosts()].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setPosts(mergedPosts);
      
      if (user) {
        const { data: likesData } = await supabase
          .from('post_likes')
          .select('post_id')
          .eq('user_id', user.id);
          
        const nextLikes = readLocalLikes(user.id);
        if (likesData) {
          likesData.forEach(l => nextLikes.add(l.post_id));
        }
        setLikedPostIds(nextLikes);
      }
    } catch (error: any) {
      console.error('Error fetching posts:', error);
      setPosts(readLocalPosts());
      if (user) setLikedPostIds(readLocalLikes(user.id));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 3000);
    fetchPosts().finally(() => {
      clearTimeout(timer);
      setLoading(false);
    });
    
    return () => clearTimeout(timer);
  }, [user?.id]);

  const handleFabClick = () => {
    if (!user) {
      alert('사용자 정보를 준비 중입니다. 잠시 후 다시 시도해주세요.');
      navigate('/my');
      return;
    }
    setIsModalOpen(true);
  };

  const handlePostSubmit = async () => {
    if (!newContent.trim() || !user) return;
    setIsSubmitting(true);
    const newPost: Post = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      title: newTitle || '동네생활',
      content: newContent,
      author_type: userRole || 'customer',
      likes_count: 0,
      user_id: user.id,
      author_name: getDisplayName(user),
      author_avatar: undefined,
      author_store_name: userRole === 'owner' ? storeName || undefined : undefined,
      comments: [{ count: 0 }],
    };

    try {
      const { error } = await supabase.from('posts').insert([
        { 
          title: newPost.title,
          content: newPost.content, 
          author_type: newPost.author_type, 
          likes_count: newPost.likes_count,
          user_id: newPost.user_id,
          author_name: newPost.author_name,
          author_avatar: null,
          author_store_name: userRole === 'owner' ? storeName : null
        }
      ]);
      
      if (error) throw error;
      
      setNewTitle('');
      setNewContent('');
      setIsModalOpen(false);
      fetchPosts();
    } catch (error) {
      console.error('Error adding post:', error);
      writeLocalPosts([newPost, ...readLocalPosts()]);
      setPosts([newPost, ...posts]);
      setNewTitle('');
      setNewContent('');
      setIsModalOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!confirm('정말로 이 게시글을 삭제하시겠습니까?')) return;
    try {
      const { error } = await supabase.from('posts').delete().eq('id', postId);
      if (error) console.warn('Post sync delete skipped:', error);
      writeLocalPosts(readLocalPosts().filter(p => p.id !== postId));
      writeLocalComments(readLocalComments().filter(c => c.post_id !== postId));
      setPosts(posts.filter(p => p.id !== postId));
      if (expandedPostId === postId) setExpandedPostId(null);
    } catch (error) {
      console.error('Error deleting post:', error);
      alert('게시글 삭제에 실패했습니다.');
    }
  };

  const handleLike = async (post: Post) => {
    if (!user) {
      alert('사용자 정보를 준비 중입니다. 잠시 후 다시 시도해주세요.');
      navigate('/my');
      return;
    }

    const isLiked = likedPostIds.has(post.id);
    const newLikesCount = isLiked ? post.likes_count - 1 : post.likes_count + 1;

    setPosts(posts.map(p => p.id === post.id ? { ...p, likes_count: newLikesCount } : p));
    const newLikedSet = new Set(likedPostIds);
    if (isLiked) newLikedSet.delete(post.id);
    else newLikedSet.add(post.id);
    setLikedPostIds(newLikedSet);
    if (user) writeLocalLikes(user.id, newLikedSet);
    
    try {
      if (isLiked) {
        await supabase.from('post_likes').delete().match({ post_id: post.id, user_id: user.id });
        await supabase.from('posts').update({ likes_count: newLikesCount }).eq('id', post.id);
      } else {
        await supabase.from('post_likes').insert([{ post_id: post.id, user_id: user.id }]);
        await supabase.from('posts').update({ likes_count: newLikesCount }).eq('id', post.id);
      }
    } catch (error) {
      console.error("좋아요 처리 실패:", error);
    }
  };

  const handleToggleComments = async (postId: string) => {
    if (expandedPostId === postId) {
      setExpandedPostId(null);
      return;
    }
    setExpandedPostId(postId);
    setComments([]); // 로딩 상태 초기화
    
    try {
      const { data, error } = await supabase
        .from('comments')
        .select('*')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      const localComments = readLocalComments().filter(comment => comment.post_id === postId);
      setComments([...(data || []), ...localComments].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      ));
    } catch (error) {
      console.error('Error fetching comments:', error);
      setComments(readLocalComments().filter(comment => comment.post_id === postId));
    }
  };

  const handleCommentSubmit = async (postId: string) => {
    if (!user) {
      alert('사용자 정보를 준비 중입니다. 잠시 후 다시 시도해주세요.');
      navigate('/my');
      return;
    }
    if (!newComment.trim()) return;

    setIsSubmittingComment(true);
    const fallbackComment: Comment = {
      id: crypto.randomUUID(),
      post_id: postId,
      user_id: user.id,
      author_name: getDisplayName(user),
      author_avatar: undefined,
      author_type: userRole || 'customer',
      author_store_name: userRole === 'owner' ? storeName || undefined : undefined,
      content: newComment,
      created_at: new Date().toISOString(),
    };

    try {
      const { data, error } = await supabase.from('comments').insert([
        {
          post_id: postId,
          user_id: user.id,
          author_name: getDisplayName(user),
          author_avatar: null,
          author_type: userRole || 'customer',
          author_store_name: userRole === 'owner' ? storeName : null,
          content: newComment
        }
      ]).select();

      if (error) throw error;

      if (data && data.length > 0) {
        setComments([...comments, data[0]]);
        
        // 현재 화면의 댓글 수 + 1 처리 (낙관적 업데이트)
        setPosts(posts.map(p => {
          if (p.id === postId) {
            const currentCount = p.comments?.[0]?.count || 0;
            return { ...p, comments: [{ count: currentCount + 1 }] };
          }
          return p;
        }));
      }
      setNewComment('');
    } catch (error: any) {
      console.error('Error creating comment:', error);
      writeLocalComments([...readLocalComments(), fallbackComment]);
      setComments([...comments, fallbackComment]);
      setPosts(posts.map(p => {
        if (p.id === postId) {
          const currentCount = p.comments?.[0]?.count || 0;
          return { ...p, comments: [{ count: currentCount + 1 }] };
        }
        return p;
      }));
      setNewComment('');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string, postId: string) => {
    if (!confirm('정말로 이 댓글을 삭제하시겠습니까?')) return;
    try {
      const { error } = await supabase.from('comments').delete().eq('id', commentId);
      if (error) console.warn('Comment sync delete skipped:', error);
      writeLocalComments(readLocalComments().filter(c => c.id !== commentId));
      setComments(comments.filter(c => c.id !== commentId));
      
      // 현재 화면의 댓글 수 - 1 처리 (낙관적 업데이트)
      setPosts(posts.map(p => {
        if (p.id === postId) {
          const currentCount = p.comments?.[0]?.count || 0;
          return { ...p, comments: [{ count: Math.max(0, currentCount - 1) }] };
        }
        return p;
      }));
    } catch (error) {
      console.error('Error deleting comment:', error);
      alert('댓글 삭제에 실패했습니다.');
    }
  };

  const timeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);
    
    if (diffInMinutes < 1) return '방금 전';
    if (diffInMinutes < 60) return `${diffInMinutes}분 전`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}시간 전`;
    return date.toLocaleDateString();
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex-1 flex flex-col bg-slate-50 min-h-screen pb-24 relative"
    >
      <header className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-slate-200 z-10 px-5 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-1">
          <MapPin size={20} className="text-violet-600" />
          우리동네 라운지
        </h1>
        {/* 기존 상단 포인트 표시는 손님 뷰 전용 대시보드로 이동 */}
        <div className="flex items-center gap-2">
          {userRole === 'owner' ? (
            <span className="bg-violet-100 text-violet-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
              <Store size={14} /> {storeName || '사장님'}
            </span>
          ) : (
            <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
              <MapPin size={14} /> 연남동
            </span>
          )}
        </div>
      </header>

      {/* Step 2: 리워드 및 홍보 대시보드 위젯 */}
      {userRole === 'customer' && (
        <div className="mx-5 mt-4 p-5 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-3xl shadow-md text-white flex flex-col gap-3 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-5 rounded-full -mr-10 -mt-10 blur-2xl pointer-events-none"></div>
          <div className="flex justify-between items-center z-10">
            <div>
              <h2 className="text-sm font-medium opacity-90">내 동네 리워드</h2>
              <div className="text-3xl font-bold mt-1 flex items-center gap-2 tracking-tight">
                <Gift size={28} className="text-yellow-300" /> {points} <span className="text-xl opacity-80 font-medium">P</span>
              </div>
            </div>
            <button className="bg-white/20 hover:bg-white/30 transition-colors px-4 py-2.5 rounded-xl text-sm font-bold backdrop-blur-sm shadow-sm">
              포인트 쓰기
            </button>
          </div>
          <div className="z-10 mt-1">
            <div className="flex justify-between text-[11px] opacity-90 mb-1.5 font-medium">
              <span>다음 혜택 등급까지 25P</span>
              <span>75 / 100</span>
            </div>
            <div className="h-1.5 bg-black/20 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: "75%" }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="h-full bg-yellow-300 rounded-full"
              ></motion.div>
            </div>
          </div>
          <div className="text-xs bg-black/10 p-3 rounded-xl mt-1 flex items-start gap-2 z-10 font-medium leading-relaxed">
            <span className="bg-yellow-300 text-yellow-900 px-1.5 py-0.5 rounded-[4px] text-[10px] font-bold shrink-0 mt-0.5">TIP</span>
            글 작성 시 10P, 유용한 정보로 선정 시 50P 즉시 지급! 동네 소식을 나눠보세요.
          </div>
        </div>
      )}


      <div className="flex flex-col gap-3 mt-4 px-5">
        <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2 mt-2">
          최신 소식
        </h3>
        
        {loading ? (
          <div className="py-12 text-center flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin"></div>
            <p className="text-sm font-medium text-slate-400">동네 소식을 불러오는 중...</p>
          </div>
        ) : posts.length === 0 ? (
          <div className="py-12 text-center bg-white rounded-3xl border border-slate-100 border-dashed">
            <p className="text-sm font-medium text-slate-400">첫 게시글을 작성해보세요!</p>
          </div>
        ) : (
          posts.map((post) => {
            // 댓글 수 렌더링 로직
            const commentCount = post.comments?.[0]?.count || 0;
            
            return (
              <div key={post.id} className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {post.author_avatar ? (
                      <img src={post.author_avatar} alt="Profile" className="w-11 h-11 rounded-full border border-slate-100 object-cover shadow-sm" />
                    ) : (
                      <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-lg shadow-sm ${post.author_type === 'owner' ? 'bg-gradient-to-br from-violet-400 to-violet-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                        {post.author_type === 'owner' ? <Store size={20} /> : (post.author_name || '?').charAt(0)}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                          <h4 className="font-bold text-slate-800 text-[15px]">{post.author_name}</h4>
                          {post.author_type === 'owner' && (
                              <span className="text-[10px] font-bold bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                  {post.author_store_name || '사장님'}
                              </span>
                          )}
                      </div>
                      <p className="text-[11px] text-slate-400 font-medium mt-0.5">{timeAgo(post.created_at)}</p>
                    </div>
                  </div>
                  {user && user.id === post.user_id && (
                    <button 
                      onClick={() => handleDeletePost(post.id)}
                      className="text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors p-2 rounded-full"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
                
                <h3 className="font-bold text-slate-800 mb-2 text-[15px] leading-snug">{post.title}</h3>
                <p className="text-slate-600 text-sm leading-relaxed mb-4 whitespace-pre-wrap">
                  {post.content}
                </p>
                
                <div className="flex items-center gap-4 border-t border-slate-100 pt-4 mt-2">
                  <button 
                    onClick={() => handleLike(post)}
                    className="flex items-center gap-1.5 text-slate-500 hover:text-rose-500 transition-colors group"
                  >
                    <Heart size={20} className={likedPostIds.has(post.id) ? "text-rose-500 fill-rose-500" : "group-hover:fill-rose-100"} />
                    <span className={`text-sm font-bold ${likedPostIds.has(post.id) ? "text-rose-500" : ""}`}>{post.likes_count}</span>
                  </button>
                  <button 
                    onClick={() => handleToggleComments(post.id)}
                    className={`flex items-center gap-1.5 transition-colors font-bold ${expandedPostId === post.id ? 'text-violet-600' : 'text-slate-500 hover:text-violet-600'}`}
                  >
                    <MessageCircle size={20} className={expandedPostId === post.id ? "fill-violet-100" : ""} />
                    <span className="text-sm">{commentCount > 0 ? commentCount : '댓글'}</span>
                  </button>
                  <button className="flex items-center gap-1.5 text-slate-500 ml-auto hover:text-slate-800 transition-colors">
                    <Share2 size={18} />
                  </button>
                </div>

                {/* 댓글 영역 (토글) */}
                <AnimatePresence>
                  {expandedPostId === post.id && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col gap-4 bg-slate-50/50 -mx-5 -mb-5 px-5 pb-5 rounded-b-3xl">
                        {/* 댓글 목록 */}
                        {comments.map((comment) => (
                          <div key={comment.id} className="flex gap-3 relative group">
                            {comment.author_avatar ? (
                              <img src={comment.author_avatar} alt="Profile" className="w-8 h-8 rounded-full border border-slate-200 flex-shrink-0 object-cover shadow-sm" />
                            ) : (
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-xs shadow-sm ${comment.author_type === 'owner' ? 'bg-gradient-to-br from-violet-400 to-violet-600 text-white' : 'bg-white border border-slate-200 text-slate-500'}`}>
                                {comment.author_type === 'owner' ? <Store size={14} /> : (comment.author_name || '?').charAt(0)}
                              </div>
                            )}
                            <div className="flex-1 bg-white p-3 rounded-2xl rounded-tl-none shadow-sm border border-slate-100">
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-slate-800 text-xs">{comment.author_name}</span>
                                  {comment.author_type === 'owner' && (
                                    <span className="text-[9px] font-bold bg-violet-100 text-violet-700 px-1 py-0.5 rounded-sm">
                                      {comment.author_store_name || '사장님'}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-slate-400 font-medium">{timeAgo(comment.created_at)}</span>
                                  {user && user.id === comment.user_id && (
                                    <button 
                                      onClick={() => handleDeleteComment(comment.id, post.id)}
                                      className="text-slate-300 hover:text-rose-500 transition-colors bg-white rounded-full"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  )}
                                </div>
                              </div>
                              <p className="text-sm text-slate-600 whitespace-pre-wrap leading-snug">{comment.content}</p>
                            </div>
                          </div>
                        ))}
                        
                        {comments.length === 0 && (
                          <div className="text-center text-slate-400 text-xs py-4 font-medium bg-white rounded-xl border border-slate-100 border-dashed">
                            가장 먼저 댓글을 남겨보세요!
                          </div>
                        )}

                        {/* 댓글 입력창 */}
                        <div className="flex items-end gap-2 mt-2">
                          <textarea 
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            placeholder="댓글을 남겨보세요..."
                            className="flex-1 bg-white border border-slate-200 shadow-sm rounded-2xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent min-h-[44px] max-h-[100px] font-medium"
                            rows={1}
                          />
                          <button 
                            onClick={() => handleCommentSubmit(post.id)}
                            disabled={isSubmittingComment || !newComment.trim()}
                            className="w-11 h-11 bg-violet-600 text-white rounded-2xl flex items-center justify-center flex-shrink-0 shadow-md shadow-violet-200 disabled:opacity-50 disabled:shadow-none disabled:bg-slate-300 transition-all hover:bg-violet-700 active:scale-95"
                          >
                            <Send size={18} className="mr-0.5" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>

      {/* FAB */}
      <button 
        onClick={handleFabClick}
        className="fixed bottom-24 right-5 w-14 h-14 bg-slate-900 rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.3)] text-white flex items-center justify-center active:scale-95 transition-transform z-20 hover:bg-slate-800"
      >
        <Plus size={28} />
      </button>

      {/* 글 작성 모달 */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative w-full max-w-[480px] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="flex justify-between items-center p-5 border-b border-slate-100">
                <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center">
                    <MessageCircle size={16} />
                  </div>
                  새로운 동네 소식
                </h3>
                <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-50 transition-colors rounded-full">
                  <X size={20} />
                </button>
              </div>
              <div className="p-5 pb-2">
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="어떤 이야기를 나누고 싶으신가요? (제목)"
                  className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white transition-all text-[15px] font-bold text-slate-800 mb-3"
                />
                <textarea 
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="자세한 내용을 작성해주세요.&#13;&#10;예: 새로 생긴 카페 다녀와보신 분 있나요?"
                  className="w-full h-40 p-4 bg-slate-50 border border-slate-100 rounded-2xl resize-none focus:outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white transition-all text-[15px]"
                />
              </div>
              <div className="p-5 pt-2">
                <button 
                  onClick={handlePostSubmit}
                  disabled={isSubmitting || !newContent.trim()}
                  className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white font-bold py-4 rounded-2xl disabled:opacity-50 disabled:bg-slate-200 transition-all shadow-lg shadow-slate-900/20"
                >
                  <Send size={18} /> {isSubmitting ? '업로드 중...' : '작성 완료'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
