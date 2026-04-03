import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { LogIn, LogOut, Smartphone, Shield, User, ChevronRight, Loader2, Search, Star, Edit2, Clock, List, Settings, Users, FolderKey, Plus, Trash2, X } from "lucide-react";

interface UserInfo {
  username: string;
  group_name: string;
}

interface DevicePref {
  is_favorite: boolean;
  nickname: string;
  last_viewed_at: string;
}

interface AdminUser {
  id: number;
  username: string;
  group_name: string;
}

interface AdminGroup {
  group_name: string;
  allowed_devices: string[];
}

export default function App() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  
  const [devices, setDevices] = useState<string[]>([]);
  const [prefs, setPrefs] = useState<Record<string, DevicePref>>({});
  
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'favorites' | 'recent'>('all');
  
  const [editingNickname, setEditingNickname] = useState<string | null>(null);
  const [tempNickname, setTempNickname] = useState("");

  // Admin state
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [adminTab, setAdminTab] = useState<'users' | 'groups' | 'settings'>('users');
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [adminGroups, setAdminGroups] = useState<AdminGroup[]>([]);
  
  // New User Form
  const [newUsername, setNewUsername] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserGroup, setNewUserGroup] = useState("");
  
  // New Group Form
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDevices, setNewGroupDevices] = useState("");

  // Change Password Form
  const [newAdminPassword, setNewAdminPassword] = useState("");

  const displayDevices = useMemo(() => {
    let filtered = devices;
    
    if (activeTab === 'favorites') {
      filtered = filtered.filter(d => prefs[d]?.is_favorite);
    } else if (activeTab === 'recent') {
      filtered = filtered.filter(d => prefs[d]?.last_viewed_at)
                         .sort((a, b) => new Date(prefs[b].last_viewed_at).getTime() - new Date(prefs[a].last_viewed_at).getTime())
                         .slice(0, 20); // Show top 20 recent
    }

    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      filtered = filtered.filter(d => {
        const nickname = prefs[d]?.nickname?.toLowerCase() || "";
        return d.toLowerCase().includes(lowerSearch) || nickname.includes(lowerSearch);
      });
    }

    return filtered;
  }, [devices, prefs, activeTab, searchTerm]);

  useEffect(() => {
    checkAuth();
  }, []);

  const getAuthHeaders = () => {
    const token = localStorage.getItem("token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const checkAuth = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/me", { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        fetchData();
      } else {
        localStorage.removeItem("token");
      }
    } catch (err) {
      console.error("Auth check failed", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchData = async () => {
    try {
      const [devRes, prefRes] = await Promise.all([
        fetch("/api/devices", { headers: getAuthHeaders() }),
        fetch("/api/prefs", { headers: getAuthHeaders() })
      ]);
      
      if (devRes.ok) {
        const data = await devRes.json();
        setDevices(data.devices);
      }
      if (prefRes.ok) {
        const data = await prefRes.json();
        const prefsMap: Record<string, DevicePref> = {};
        data.prefs.forEach((p: any) => {
          prefsMap[p.device_id] = {
            is_favorite: Boolean(p.is_favorite),
            nickname: p.nickname || "",
            last_viewed_at: p.last_viewed_at || ""
          };
        });
        setPrefs(prefsMap);
      }
    } catch (err) {
      console.error("Failed to fetch data", err);
    }
  };

  const fetchAdminData = async () => {
    try {
      const [usersRes, groupsRes] = await Promise.all([
        fetch("/api/admin/users", { headers: getAuthHeaders() }),
        fetch("/api/admin/groups", { headers: getAuthHeaders() })
      ]);
      
      if (usersRes.ok) {
        const data = await usersRes.json();
        setAdminUsers(data.users);
      }
      if (groupsRes.ok) {
        const data = await groupsRes.json();
        setAdminGroups(data.groups);
      }
    } catch (err) {
      console.error("Failed to fetch admin data", err);
    }
  };

  useEffect(() => {
    if (showAdminPanel && user?.group_name === 'admin') {
      fetchAdminData();
    }
  }, [showAdminPanel, user]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem("token", data.token);
        setUser(data.user);
        fetchData();
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ? `로그인 실패: ${data.error}` : "로그인 실패: 아이디 또는 비밀번호를 확인하세요.");
      }
    } catch (err) {
      setError("서버 오류가 발생했습니다.");
    }
  };

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST", headers: getAuthHeaders() });
    localStorage.removeItem("token");
    setUser(null);
    setDevices([]);
    setPrefs({});
    setSelectedDevice(null);
  };

  const toggleFavorite = async (e: React.MouseEvent, deviceId: string) => {
    e.stopPropagation();
    const current = prefs[deviceId]?.is_favorite || false;
    const next = !current;
    
    setPrefs(prev => ({
      ...prev,
      [deviceId]: { ...prev[deviceId], is_favorite: next }
    }));

    await fetch(`/api/prefs/${deviceId}/favorite`, {
      method: "POST",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ is_favorite: next })
    });
  };

  const saveNickname = async (deviceId: string) => {
    const nickname = tempNickname.trim().slice(0, 10);
    
    setPrefs(prev => ({
      ...prev,
      [deviceId]: { ...prev[deviceId], nickname }
    }));
    setEditingNickname(null);

    await fetch(`/api/prefs/${deviceId}/nickname`, {
      method: "POST",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ nickname })
    });
  };

  const markAsViewed = async (deviceId: string) => {
    const now = new Date().toISOString();
    setPrefs(prev => ({
      ...prev,
      [deviceId]: { ...prev[deviceId], last_viewed_at: now }
    }));

    await fetch(`/api/prefs/${deviceId}/view`, {
      method: "POST",
      headers: getAuthHeaders()
    });
  };

  const handleDeviceClick = (deviceId: string) => {
    markAsViewed(deviceId);
    setSelectedDevice(deviceId);
  };

  const getProxyUrl = (deviceId: string) => {
    const token = localStorage.getItem("token");
    return `/api/proxy/${deviceId}?token=${token}`;
  };

  // Admin Actions
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ username: newUsername, password: newUserPassword, group_name: newUserGroup }),
      });
      if (res.ok) {
        setNewUsername("");
        setNewUserPassword("");
        setNewUserGroup("");
        fetchAdminData();
      } else {
        const data = await res.json();
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteUser = async (id: number) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (res.ok) fetchAdminData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Parse devices string (comma separated or ranges)
      // Simple implementation: just split by comma
      const devicesList = newGroupDevices.split(',').map(d => d.trim()).filter(Boolean);
      
      const res = await fetch("/api/admin/groups", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ group_name: newGroupName, allowed_devices: devicesList }),
      });
      if (res.ok) {
        setNewGroupName("");
        setNewGroupDevices("");
        fetchAdminData();
      } else {
        const data = await res.json();
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteGroup = async (name: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try {
      const res = await fetch(`/api/admin/groups/${name}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (res.ok) fetchAdminData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/me/password", {
        method: "PUT",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: newAdminPassword }),
      });
      if (res.ok) {
        alert("비밀번호가 성공적으로 변경되었습니다.");
        setNewAdminPassword("");
      } else {
        const data = await res.json();
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-lg bg-surface-lowest rounded-[2rem] p-10 sm:p-14 shadow-[0_20px_40px_rgba(25,28,29,0.06)]"
        >
          <div className="mb-12">
            <div className="w-16 h-16 bg-primary-container/30 rounded-full flex items-center justify-center mb-6">
              <Shield className="w-8 h-8 text-primary" />
            </div>
            <h1 className="font-display text-[1.75rem] font-extrabold text-primary mb-2 tracking-tight">
              환영합니다
            </h1>
            <p className="text-on-surface/60 text-[0.875rem]">
              금쪽이 모니터링 시스템에 로그인하세요.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-[0.75rem] font-bold text-on-surface/80 uppercase tracking-wide mb-2 ml-1">
                아이디
              </label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface/40" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-surface-low rounded-lg py-4 pl-12 pr-4 text-[0.875rem] text-on-surface placeholder:text-on-surface/40 focus:outline-none focus:shadow-[0_0_4px_2px_rgba(0,105,114,0.3)] transition-shadow"
                  placeholder="아이디 입력"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-[0.75rem] font-bold text-on-surface/80 uppercase tracking-wide mb-2 ml-1">
                비밀번호
              </label>
              <div className="relative">
                <LogIn className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface/40" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-surface-low rounded-lg py-4 pl-12 pr-4 text-[0.875rem] text-on-surface placeholder:text-on-surface/40 focus:outline-none focus:shadow-[0_0_4px_2px_rgba(0,105,114,0.3)] transition-shadow"
                  placeholder="비밀번호 입력"
                  required
                />
              </div>
            </div>
            
            <AnimatePresence>
              {error && (
                <motion.p 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-secondary text-[0.875rem] font-medium bg-secondary/10 py-3 px-4 rounded-lg"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-primary to-primary-container text-white rounded-full py-4 font-bold text-[1rem] shadow-[0_10px_20px_rgba(112,214,227,0.3)] hover:shadow-[0_15px_25px_rgba(112,214,227,0.4)] transition-all active:scale-[0.98] mt-4"
            >
              로그인
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      {/* Glassmorphism Header */}
      <header className="bg-white/70 backdrop-blur-[12px] sticky top-0 z-50 px-6 sm:px-12 py-4 flex justify-between items-center border-b border-surface-low">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-container/30 rounded-full flex items-center justify-center">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <h1 className="font-display font-bold text-primary text-xl tracking-tight hidden sm:block">
            금쪽이 모니터링
          </h1>
        </div>
        
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="bg-surface-low px-4 py-2 rounded-full text-[0.75rem] font-bold tracking-wide uppercase text-on-surface/80 hidden sm:block">
            {user.group_name} 그룹
          </div>
          
          {user.group_name === 'admin' && (
            <button
              onClick={() => setShowAdminPanel(true)}
              className="text-primary hover:bg-primary/10 px-4 py-2 rounded-full text-[0.875rem] font-semibold transition-colors flex items-center gap-2"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">관리자</span>
            </button>
          )}

          <button
            onClick={handleLogout}
            className="text-secondary hover:bg-secondary/10 px-4 sm:px-5 py-2.5 rounded-full text-[0.875rem] font-semibold transition-colors flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">로그아웃</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-[1600px] w-full mx-auto flex flex-col">
        <AnimatePresence mode="wait">
          {!selectedDevice ? (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="flex-1 flex flex-col"
            >
              {/* Asymmetrical Header */}
              <div className="pt-[4rem] sm:pt-[5rem] pl-[2rem] sm:pl-[3rem] pr-[2rem] pb-8">
                <h2 className="font-display text-[2.5rem] sm:text-[3.5rem] font-extrabold text-primary leading-tight mb-4 tracking-tight">
                  기기 대시보드
                </h2>
                <p className="text-[1rem] text-on-surface/70 max-w-2xl leading-relaxed">
                  배정된 기기의 대화 기록을 모니터링하세요. 현재 그룹에 총 <strong className="text-on-surface">{devices.length}</strong>대의 기기가 있습니다.
                </p>
                
                <div className="mt-10 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                  <div className="relative w-full max-w-md">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface/40" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="기기 번호 또는 별명 검색 (예: n001)"
                      className="w-full bg-surface-lowest rounded-full py-4 pl-14 pr-6 text-[1rem] text-on-surface placeholder:text-on-surface/40 focus:outline-none focus:shadow-[0_0_4px_2px_rgba(0,105,114,0.3)] shadow-[0_10px_30px_rgba(25,28,29,0.04)] transition-all"
                    />
                  </div>

                  <div className="flex bg-surface-low p-1 rounded-full">
                    <button 
                      onClick={() => setActiveTab('all')}
                      className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-[0.875rem] font-bold transition-all ${activeTab === 'all' ? 'bg-surface-lowest shadow-sm text-primary' : 'text-on-surface/60 hover:text-on-surface'}`}
                    >
                      <List className="w-4 h-4" /> 전체
                    </button>
                    <button 
                      onClick={() => setActiveTab('favorites')}
                      className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-[0.875rem] font-bold transition-all ${activeTab === 'favorites' ? 'bg-surface-lowest shadow-sm text-primary' : 'text-on-surface/60 hover:text-on-surface'}`}
                    >
                      <Star className="w-4 h-4" /> 즐겨찾기
                    </button>
                    <button 
                      onClick={() => setActiveTab('recent')}
                      className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-[0.875rem] font-bold transition-all ${activeTab === 'recent' ? 'bg-surface-lowest shadow-sm text-primary' : 'text-on-surface/60 hover:text-on-surface'}`}
                    >
                      <Clock className="w-4 h-4" /> 최근 열람
                    </button>
                  </div>
                </div>
              </div>

              {/* Device Grid */}
              <div className="px-[2rem] sm:px-[3rem] pb-16">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 sm:gap-8">
                  {displayDevices.map((device) => (
                    <motion.div
                      key={device}
                      whileHover={{ y: -4 }}
                      className="bg-surface-lowest rounded-[2rem] p-8 flex flex-col items-start text-left shadow-[0_4px_20px_rgba(25,28,29,0.02)] hover:shadow-[0_20px_40px_rgba(25,28,29,0.06)] transition-all duration-300 group relative"
                    >
                      <button 
                        onClick={(e) => toggleFavorite(e, device)} 
                        className="absolute top-6 right-6 p-2 hover:bg-surface-low rounded-full transition-colors z-10"
                        title="즐겨찾기"
                      >
                        <Star className={`w-6 h-6 ${prefs[device]?.is_favorite ? 'fill-tertiary text-tertiary' : 'text-on-surface/20 hover:text-tertiary/50'}`} />
                      </button>

                      <div 
                        className="w-14 h-14 rounded-full bg-primary-container/20 text-primary flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-primary-container/40 transition-all cursor-pointer"
                        onClick={() => handleDeviceClick(device)}
                      >
                        <Smartphone className="w-7 h-7" />
                      </div>
                      
                      <div className="w-full mb-4">
                        {editingNickname === device ? (
                          <div className="flex items-center gap-2 w-full">
                            <input 
                              autoFocus
                              maxLength={10}
                              value={tempNickname}
                              onChange={e => setTempNickname(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && saveNickname(device)}
                              onBlur={() => saveNickname(device)}
                              className="w-full bg-surface-low border border-primary/30 rounded-lg px-3 py-2 text-[1rem] font-bold outline-none focus:ring-2 focus:ring-primary/50"
                              placeholder="별명 (최대 10자)"
                            />
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 group/edit w-full">
                            <h3 
                              className="font-display text-[1.5rem] font-bold text-on-surface tracking-tight truncate cursor-pointer"
                              onClick={() => handleDeviceClick(device)}
                            >
                              {prefs[device]?.nickname || device}
                            </h3>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setTempNickname(prefs[device]?.nickname || "");
                                setEditingNickname(device);
                              }}
                              className="opacity-0 group-hover/edit:opacity-100 p-1.5 hover:bg-surface-low rounded-lg transition-colors"
                              title="별명 수정"
                            >
                              <Edit2 className="w-4 h-4 text-on-surface/50" />
                            </button>
                          </div>
                        )}
                        {prefs[device]?.nickname && (
                          <p className="text-[0.875rem] text-on-surface/40 font-mono mt-1">{device}</p>
                        )}
                      </div>

                      <button 
                        onClick={() => handleDeviceClick(device)}
                        className="text-[0.875rem] text-primary font-bold mt-auto hover:underline flex items-center gap-1"
                      >
                        대화 기록 보기 <ChevronRight className="w-4 h-4" />
                      </button>
                    </motion.div>
                  ))}
                </div>

                {devices.length > 0 && displayDevices.length === 0 && (
                  <div className="text-center py-32 bg-surface-lowest rounded-[2rem] mt-8">
                    <Search className="w-12 h-12 text-on-surface/20 mx-auto mb-6" />
                    <p className="text-on-surface/60 text-[1.125rem] font-medium">표시할 기기가 없습니다.</p>
                  </div>
                )}

                {devices.length === 0 && (
                  <div className="text-center py-32 bg-surface-lowest rounded-[2rem] mt-8">
                    <Smartphone className="w-12 h-12 text-on-surface/20 mx-auto mb-6" />
                    <p className="text-on-surface/60 text-[1.125rem] font-medium">배정된 기기가 없습니다.</p>
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="proxy"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="flex-1 flex flex-col lg:flex-row gap-6 sm:gap-8 p-4 sm:p-8 h-[calc(100vh-5rem)]"
            >
              {/* Left Sidebar: Device List */}
              <div className="w-full lg:w-1/3 lg:max-w-sm bg-surface-lowest rounded-[2rem] flex flex-col overflow-hidden shadow-[0_20px_40px_rgba(25,28,29,0.03)] h-1/3 lg:h-full">
                <div className="p-6 sm:p-8 pb-4">
                  <h2 className="font-display text-[1.75rem] font-bold text-primary mb-6 tracking-tight">기기 목록</h2>
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface/40" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="검색..."
                      className="w-full bg-surface-low rounded-lg py-3 pl-12 pr-4 text-[0.875rem] text-on-surface focus:outline-none focus:shadow-[0_0_4px_2px_rgba(0,105,114,0.3)] transition-shadow"
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-2">
                  {displayDevices.map(device => (
                    <button
                      key={device}
                      onClick={() => handleDeviceClick(device)}
                      className={`px-4 py-4 rounded-2xl cursor-pointer transition-colors flex items-center justify-between text-left ${
                        selectedDevice === device 
                          ? 'bg-primary-container/30 text-primary' 
                          : 'hover:bg-surface-low text-on-surface/80'
                      }`}
                    >
                      <div className="flex flex-col truncate pr-2">
                        <span className="font-bold text-[1rem] truncate">
                          {prefs[device]?.nickname || device}
                        </span>
                        {prefs[device]?.nickname && (
                          <span className="text-[0.75rem] opacity-60 font-mono">{device}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {prefs[device]?.is_favorite && <Star className="w-4 h-4 fill-tertiary text-tertiary" />}
                        {selectedDevice === device && <div className="w-2 h-2 rounded-full bg-primary" />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Right Content: Iframe */}
              <div className="flex-1 bg-surface-lowest rounded-[2rem] shadow-[0_20px_40px_rgba(25,28,29,0.06)] overflow-hidden flex flex-col relative h-2/3 lg:h-full">
                <div className="px-6 sm:px-8 py-5 flex items-center justify-between bg-surface-lowest z-10 border-b border-surface-low">
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => setSelectedDevice(null)} 
                      className="flex items-center gap-2 px-4 py-2 rounded-full bg-surface-low hover:bg-surface-low/80 text-on-surface transition-colors font-bold text-[0.875rem]"
                    >
                      <ChevronRight className="w-5 h-5 rotate-180" />
                      <span className="hidden sm:inline">홈으로</span>
                    </button>
                    <div className="flex flex-col">
                      <h2 className="font-display text-[1.75rem] font-bold text-on-surface tracking-tight">
                        {prefs[selectedDevice]?.nickname || selectedDevice}
                      </h2>
                      {prefs[selectedDevice]?.nickname && (
                        <span className="text-[0.875rem] text-on-surface/50 font-mono">{selectedDevice}</span>
                      )}
                    </div>
                  </div>
                  <div className="bg-primary-container/20 text-primary px-4 py-2 rounded-full text-[0.75rem] font-bold uppercase tracking-wide flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    실시간 연결
                  </div>
                </div>
                <div className="flex-1 relative bg-surface-low">
                  <iframe
                    src={getProxyUrl(selectedDevice)}
                    className="absolute inset-0 w-full h-full border-none"
                    title={`Device ${selectedDevice}`}
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Admin Panel Modal */}
      <AnimatePresence>
        {showAdminPanel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-surface/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-surface-lowest w-full max-w-5xl max-h-[90vh] rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.1)] flex flex-col overflow-hidden"
            >
              <div className="px-8 py-6 border-b border-surface-low flex items-center justify-between bg-surface-lowest z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                    <Settings className="w-5 h-5 text-primary" />
                  </div>
                  <h2 className="font-display text-[1.5rem] font-bold text-primary">관리자 설정</h2>
                </div>
                <button 
                  onClick={() => setShowAdminPanel(false)}
                  className="p-2 hover:bg-surface-low rounded-full transition-colors"
                >
                  <X className="w-6 h-6 text-on-surface/60" />
                </button>
              </div>

              <div className="flex flex-col sm:flex-row flex-1 overflow-hidden">
                {/* Admin Sidebar */}
                <div className="w-full sm:w-64 bg-surface-low/50 border-r border-surface-low p-4 flex flex-col gap-2 shrink-0">
                  <button
                    onClick={() => setAdminTab('users')}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-colors ${
                      adminTab === 'users' ? 'bg-primary text-white shadow-md' : 'text-on-surface/70 hover:bg-surface-low hover:text-on-surface'
                    }`}
                  >
                    <Users className="w-5 h-5" /> 계정 관리
                  </button>
                  <button
                    onClick={() => setAdminTab('groups')}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-colors ${
                      adminTab === 'groups' ? 'bg-primary text-white shadow-md' : 'text-on-surface/70 hover:bg-surface-low hover:text-on-surface'
                    }`}
                  >
                    <FolderKey className="w-5 h-5" /> 그룹 및 기기 할당
                  </button>
                  <button
                    onClick={() => setAdminTab('settings')}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-colors ${
                      adminTab === 'settings' ? 'bg-primary text-white shadow-md' : 'text-on-surface/70 hover:bg-surface-low hover:text-on-surface'
                    }`}
                  >
                    <Settings className="w-5 h-5" /> 설정
                  </button>
                </div>

                {/* Admin Content */}
                <div className="flex-1 overflow-y-auto p-6 sm:p-8 bg-surface-lowest">
                  {adminTab === 'users' && (
                    <div className="space-y-8">
                      <div>
                        <h3 className="text-[1.25rem] font-bold text-on-surface mb-4">새 계정 생성</h3>
                        <form onSubmit={handleCreateUser} className="bg-surface-low/50 p-6 rounded-2xl border border-surface-low flex flex-col sm:flex-row gap-4 items-end">
                          <div className="flex-1 w-full">
                            <label className="block text-[0.75rem] font-bold text-on-surface/60 uppercase mb-2">아이디</label>
                            <input
                              type="text"
                              required
                              value={newUsername}
                              onChange={e => setNewUsername(e.target.value)}
                              className="w-full bg-surface-lowest rounded-lg px-4 py-2.5 text-[0.875rem] border border-surface-low focus:border-primary focus:outline-none"
                              placeholder="user123"
                            />
                          </div>
                          <div className="flex-1 w-full">
                            <label className="block text-[0.75rem] font-bold text-on-surface/60 uppercase mb-2">비밀번호</label>
                            <input
                              type="password"
                              required
                              value={newUserPassword}
                              onChange={e => setNewUserPassword(e.target.value)}
                              className="w-full bg-surface-lowest rounded-lg px-4 py-2.5 text-[0.875rem] border border-surface-low focus:border-primary focus:outline-none"
                              placeholder="••••••••"
                            />
                          </div>
                          <div className="flex-1 w-full">
                            <label className="block text-[0.75rem] font-bold text-on-surface/60 uppercase mb-2">소속 그룹</label>
                            <select
                              required
                              value={newUserGroup}
                              onChange={e => setNewUserGroup(e.target.value)}
                              className="w-full bg-surface-lowest rounded-lg px-4 py-2.5 text-[0.875rem] border border-surface-low focus:border-primary focus:outline-none"
                            >
                              <option value="">그룹 선택...</option>
                              {adminGroups.map(g => (
                                <option key={g.group_name} value={g.group_name}>{g.group_name}</option>
                              ))}
                            </select>
                          </div>
                          <button type="submit" className="w-full sm:w-auto bg-primary text-white px-6 py-2.5 rounded-lg font-bold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2">
                            <Plus className="w-4 h-4" /> 생성
                          </button>
                        </form>
                      </div>

                      <div>
                        <h3 className="text-[1.25rem] font-bold text-on-surface mb-4">계정 목록</h3>
                        <div className="bg-surface-lowest border border-surface-low rounded-2xl overflow-hidden">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-surface-low/50 border-b border-surface-low">
                                <th className="px-6 py-4 text-[0.75rem] font-bold text-on-surface/60 uppercase">ID</th>
                                <th className="px-6 py-4 text-[0.75rem] font-bold text-on-surface/60 uppercase">아이디</th>
                                <th className="px-6 py-4 text-[0.75rem] font-bold text-on-surface/60 uppercase">소속 그룹</th>
                                <th className="px-6 py-4 text-[0.75rem] font-bold text-on-surface/60 uppercase text-right">관리</th>
                              </tr>
                            </thead>
                            <tbody>
                              {adminUsers.map(u => (
                                <tr key={u.id} className="border-b border-surface-low last:border-0 hover:bg-surface-low/30 transition-colors">
                                  <td className="px-6 py-4 text-[0.875rem] text-on-surface/60 font-mono">{u.id}</td>
                                  <td className="px-6 py-4 text-[0.875rem] font-bold text-on-surface">{u.username}</td>
                                  <td className="px-6 py-4">
                                    <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-[0.75rem] font-bold">
                                      {u.group_name}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 text-right">
                                    {u.username !== 'admin' && (
                                      <button 
                                        onClick={() => handleDeleteUser(u.id)}
                                        className="p-2 text-secondary hover:bg-secondary/10 rounded-lg transition-colors"
                                        title="삭제"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {adminTab === 'groups' && (
                    <div className="space-y-8">
                      <div>
                        <h3 className="text-[1.25rem] font-bold text-on-surface mb-4">새 그룹 생성 및 기기 할당</h3>
                        <form onSubmit={handleCreateGroup} className="bg-surface-low/50 p-6 rounded-2xl border border-surface-low flex flex-col gap-4">
                          <div>
                            <label className="block text-[0.75rem] font-bold text-on-surface/60 uppercase mb-2">그룹명</label>
                            <input
                              type="text"
                              required
                              value={newGroupName}
                              onChange={e => setNewGroupName(e.target.value)}
                              className="w-full max-w-md bg-surface-lowest rounded-lg px-4 py-2.5 text-[0.875rem] border border-surface-low focus:border-primary focus:outline-none"
                              placeholder="예: A그룹, B그룹"
                            />
                          </div>
                          <div>
                            <label className="block text-[0.75rem] font-bold text-on-surface/60 uppercase mb-2">할당할 기기 목록 (쉼표로 구분)</label>
                            <textarea
                              required
                              value={newGroupDevices}
                              onChange={e => setNewGroupDevices(e.target.value)}
                              className="w-full bg-surface-lowest rounded-lg px-4 py-3 text-[0.875rem] font-mono border border-surface-low focus:border-primary focus:outline-none h-32 resize-none"
                              placeholder="n001, n002, n003, k0001, k0002..."
                            />
                            <p className="text-[0.75rem] text-on-surface/50 mt-2">
                              기기 번호를 쉼표(,)로 구분하여 입력하세요. 기존에 있는 그룹명을 입력하면 기기 목록이 덮어씌워집니다.
                            </p>
                          </div>
                          <div className="flex justify-end">
                            <button type="submit" className="bg-primary text-white px-6 py-2.5 rounded-lg font-bold hover:bg-primary/90 transition-colors flex items-center gap-2">
                              <Plus className="w-4 h-4" /> 저장
                            </button>
                          </div>
                        </form>
                      </div>

                      <div>
                        <h3 className="text-[1.25rem] font-bold text-on-surface mb-4">그룹 목록</h3>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          {adminGroups.map(g => (
                            <div key={g.group_name} className="bg-surface-lowest border border-surface-low rounded-2xl p-6 relative group">
                              {g.group_name !== 'admin' && (
                                <button 
                                  onClick={() => handleDeleteGroup(g.group_name)}
                                  className="absolute top-4 right-4 p-2 text-secondary hover:bg-secondary/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                  title="그룹 삭제"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                              <h4 className="font-bold text-[1.125rem] text-on-surface mb-2 flex items-center gap-2">
                                <FolderKey className="w-5 h-5 text-primary" />
                                {g.group_name}
                              </h4>
                              <p className="text-[0.875rem] text-on-surface/60 mb-4">
                                총 <strong className="text-on-surface">{g.allowed_devices.length}</strong>대의 기기 할당됨
                              </p>
                              <div className="bg-surface-low/50 rounded-lg p-3 max-h-32 overflow-y-auto">
                                <p className="text-[0.75rem] font-mono text-on-surface/70 leading-relaxed break-all">
                                  {g.allowed_devices.join(', ')}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {adminTab === 'settings' && (
                    <div className="space-y-8">
                      <div>
                        <h3 className="text-[1.25rem] font-bold text-on-surface mb-4">비밀번호 변경</h3>
                        <form onSubmit={handleChangePassword} className="bg-surface-low/50 p-6 rounded-2xl border border-surface-low flex flex-col gap-4 max-w-md">
                          <div>
                            <label className="block text-[0.75rem] font-bold text-on-surface/60 uppercase mb-2">새 비밀번호</label>
                            <input
                              type="password"
                              required
                              value={newAdminPassword}
                              onChange={e => setNewAdminPassword(e.target.value)}
                              className="w-full bg-surface-lowest rounded-lg px-4 py-2.5 text-[0.875rem] border border-surface-low focus:border-primary focus:outline-none"
                              placeholder="새 비밀번호 입력 (최소 4자)"
                              minLength={4}
                            />
                          </div>
                          <div className="flex justify-end mt-2">
                            <button type="submit" className="bg-primary text-white px-6 py-2.5 rounded-lg font-bold hover:bg-primary/90 transition-colors flex items-center gap-2">
                              <Edit2 className="w-4 h-4" /> 변경하기
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
