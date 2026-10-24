(() => {
  const $ = (id) => document.getElementById(id);
  const form = $('paymentForm');
  const cfg = window.IT_PAYMENT_CONFIG || {};
  let db = null;
  let records = [];
  let currentUser = null;
  let activeRole = null;
  let editId = null;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = n => new Intl.NumberFormat('en-IN', {style:'currency', currency:'INR', maximumFractionDigits:2}).format(Number(n) || 0);
  const today = () => new Date().toISOString().slice(0, 10);
  const roleLabel = role => role === 'master' ? 'Master' : 'User';
  function toast(message) { const t=$('toast'); t.textContent=message; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2800); }
  function showError(message) { $('authError').textContent=message; }
  function lockPage(message) { $('authNotice').textContent=message; $('authNotice').classList.add('show'); $('loginBtn').disabled=true; $('resetPasswordBtn').disabled=true; }
  function isMissingActiveField(error) { return error?.code==='42703'||error?.code==='PGRST204'||/active.*column|column.*active/i.test(error?.message||''); }
  function parseRow(row) { return {id:row.id,vendor:row.vendor,po:row.po,invoice:row.invoice,amount:Number(row.amount),invoiceDate:row.invoice_date||'',dueDate:row.due_date||'',status:row.status,utr:row.utr||'',paymentDate:row.payment_date||'',notes:row.notes||'',createdBy:row.created_by}; }
  function dbRow(d) { return {vendor:d.vendor,po:d.po,invoice:d.invoice,amount:Number(d.amount),invoice_date:d.invoiceDate||null,due_date:d.dueDate||null,status:d.status,utr:d.utr||null,payment_date:d.paymentDate||null,notes:d.notes||null}; }
  function overdue(r) { return r.status !== 'Paid' && r.dueDate && r.dueDate < today(); }
  function statusOf(r) { return overdue(r) ? 'Overdue' : r.status; }

  async function fetchRecords() {
    const {data,error}=await db.from('it_payments').select('*').order('invoice_date',{ascending:false,nullsFirst:false});
    if(error) throw error;
    records=(data||[]).map(parseRow);
    render();
  }

  function render() {
    const vendors=[...new Set(records.map(r=>String(r.vendor||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    const selectedVendor=$('vendorFilter').value;
    $('vendorSuggestions').innerHTML=vendors.map(v=>`<option value="${esc(v)}"></option>`).join('');
    $('vendorFilter').innerHTML='<option value="">All vendors</option>'+vendors.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
    if(vendors.includes(selectedVendor)) $('vendorFilter').value=selectedVendor;
    const scope=selectedVendor?records.filter(r=>r.vendor===selectedVendor):records;
    const pending=scope.filter(r=>r.status!=='Paid');
    const paid=scope.filter(r=>r.status==='Paid');
    $('totalLabel').textContent=selectedVendor?'Vendor total':'Total tracked';
    $('pendingLabel').textContent=selectedVendor?'Vendor pending':'Awaiting payment';
    $('paidLabel').textContent=selectedVendor?'Vendor paid':'Paid / UTR received';
    $('overdueLabel').textContent=selectedVendor?'Vendor overdue':'Overdue';
    $('totalValue').textContent=money(scope.reduce((a,r)=>a+r.amount,0));
    $('totalCount').textContent=`${scope.length} invoice${scope.length===1?'':'s'}`;
    $('pendingValue').textContent=money(pending.reduce((a,r)=>a+r.amount,0));
    $('pendingCount').textContent=`${pending.length} invoice${pending.length===1?'':'s'}`;
    $('paidValue').textContent=money(paid.reduce((a,r)=>a+r.amount,0));
    $('paidCount').textContent=`${paid.length} invoice${paid.length===1?'':'s'}`;
    const late=scope.filter(overdue);
    $('overdueValue').textContent=money(late.reduce((a,r)=>a+r.amount,0));
    $('overdueCount').textContent=`${late.length} invoice${late.length===1?'':'s'}`;

    const q=$('search').value.trim().toLowerCase(),f=$('statusFilter').value;
    const shown=scope.filter(r=>{const hay=[r.vendor,r.po,r.invoice,r.utr,r.notes].join(' ').toLowerCase();return(!q||hay.includes(q))&&(!f||statusOf(r)===f)}).sort((a,b)=>(b.invoiceDate||'').localeCompare(a.invoiceDate||''));
    $('rows').innerHTML=shown.map(r=>{const st=statusOf(r),cls=st==='Paid'?'paid':st==='Overdue'?'overdue':st==='Partially Paid'?'partial':'pending';const del=activeRole==='master'?`<button class="icon-btn" data-delete="${esc(r.id)}" aria-label="Delete invoice">Delete</button>`:'';return `<tr><td><div class="vendor">${esc(r.vendor)}</div>${r.notes?`<div class="subcell">${esc(r.notes)}</div>`:''}</td><td>${esc(r.po)}</td><td>${esc(r.invoice)}</td><td>${esc(r.invoiceDate||'—')}</td><td>${esc(r.dueDate||'—')}</td><td class="money">${money(r.amount)}</td><td><span class="badge ${cls}">${st}</span></td><td>${esc(r.utr||'—')}</td><td>${esc(r.paymentDate||'—')}</td><td><div class="row-actions"><button class="icon-btn" data-edit="${esc(r.id)}">Edit</button>${del}</div></td></tr>`}).join('');
    $('emptyState').style.display=shown.length?'none':'block';
    $('emptyState').textContent=records.length?'No matching invoices. Try changing your search or filter.':'No invoices yet. Add the first invoice above to start tracking.';
    $('visibleCount').textContent=`Showing ${shown.length} of ${scope.length} record${scope.length===1?'':'s'}`;
  }

  async function openApp(user, role) {
    currentUser=user; activeRole=role;
    $('userBadge').textContent=`${user.email} · ${roleLabel(role)}`;
    $('welcomePage').hidden=true; $('loginPage').hidden=true; $('appShell').hidden=false;
    $('userAccessPanel').hidden=role!=='master';
    try { await fetchRecords(); if(role==='master') await fetchUsers(); }
    catch(error) { await db.auth.signOut();currentUser=null;activeRole=null;$('appShell').hidden=true;$('welcomePage').hidden=true;$('loginPage').hidden=false;showError('Could not load tracker data. Check the database setup or contact the tracker Master.'); }
  }

  async function getAssignedRole(user) {
    const {data,error}=await db.from('it_user_roles').select('role,active').eq('user_id',user.id).maybeSingle();
    if(error&&isMissingActiveField(error)){
      const legacy=await db.from('it_user_roles').select('role').eq('user_id',user.id).maybeSingle();
      if(legacy.error)throw legacy.error;
      if(!legacy.data)throw new Error('This account has not been assigned a tracker role. Ask the Master to invite and configure your account.');
      return legacy.data.role;
    }
    if(error) throw error;
    if(!data) throw new Error('This account has not been assigned a tracker role. Ask the Master to invite and configure your account.');
    if(!data.active) throw new Error('This account has been deactivated. Contact an active Master for access.');
    return data.role;
  }
  async function verifyRole(user, requiredRole) {
    const assignedRole=await getAssignedRole(user);
    if(assignedRole!==requiredRole) throw new Error(`This account is assigned the ${roleLabel(assignedRole)} role. Choose that role and sign in again.`);
    return assignedRole;
  }

  $('loginForm').addEventListener('submit',async e=>{
    e.preventDefault(); showError(''); $('loginBtn').disabled=true;
    const email=$('loginEmail').value.trim(),password=$('loginPassword').value,role=$('loginRole').value;
    const {data,error}=await db.auth.signInWithPassword({email,password});
    if(error){showError('Sign-in failed. Check your email and password, then try again.');$('loginBtn').disabled=false;return;}
    try { const assigned=await verifyRole(data.user,role); await openApp(data.user,assigned); }
    catch(err){await db.auth.signOut();showError(err.message||'This account cannot access the tracker.');}
    $('loginBtn').disabled=false;
  });
  $('enterBtn').addEventListener('click',()=>{$('welcomePage').hidden=true;$('loginPage').hidden=false;$('loginEmail').focus();});
  $('backBtn').addEventListener('click',()=>{$('loginPage').hidden=true;$('welcomePage').hidden=false;showError('');});
  $('resetPasswordBtn').addEventListener('click',async()=>{
    showError('');const email=$('loginEmail').value.trim();
    if(!email){showError('Enter your email address first.');return;}
    const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin+window.location.pathname});
    showError(error?'Password reset could not be sent. Check the email address or ask the Master for help.':'If that account is registered, a password reset link has been sent.');
  });
  $('newPasswordForm').addEventListener('submit',async e=>{
    e.preventDefault();$('passwordError').textContent='';const next=$('newPassword').value,confirmValue=$('confirmPassword').value;
    if(next.length<12){$('passwordError').textContent='Use a password with at least 12 characters.';return;}
    if(next!==confirmValue){$('passwordError').textContent='The passwords do not match.';return;}
    const {error}=await db.auth.updateUser({password:next});
    if(error){$('passwordError').textContent='The password could not be updated. Request a new reset link and try again.';return;}
    await db.auth.signOut();history.replaceState(null,'',window.location.pathname);$('newPasswordForm').hidden=true;$('loginForm').hidden=false;$('newPasswordForm').reset();showError('Password updated. Sign in with your new password.');
  });
  $('signOutBtn').addEventListener('click',async()=>{await db.auth.signOut();currentUser=null;activeRole=null;records=[];$('appShell').hidden=true;$('loginPage').hidden=true;$('welcomePage').hidden=false;form.reset();showError('');});

  form.addEventListener('submit',async e=>{
    e.preventDefault();const d=Object.fromEntries(new FormData(form).entries());d.amount=Number(d.amount);d.vendor=d.vendor.trim();d.po=d.po.trim();d.invoice=d.invoice.trim();
    if(!d.vendor||!d.po||!d.invoice||d.amount<=0)return;
    if(d.status==='Paid'&&!d.paymentDate)d.paymentDate=today();
    const payload=dbRow(d);let result;
    if(editId) result=await db.from('it_payments').update(payload).eq('id',editId);
    else result=await db.from('it_payments').insert({...payload,created_by:currentUser.id});
    if(result.error){toast(result.error.message.includes('duplicate')?'That vendor, PO and invoice combination already exists.':`Save failed: ${result.error.message}`);return;}
    editId=null;form.reset();$('formTitle').textContent='Add an invoice';$('saveBtn').textContent='Add invoice';$('cancelEdit').hidden=true;toast('Invoice saved');await fetchRecords();
  });
  $('rows').addEventListener('click',async e=>{
    const edit=e.target.closest('[data-edit]'),del=e.target.closest('[data-delete]');
    if(edit){const r=records.find(x=>x.id===edit.dataset.edit);if(!r)return;editId=r.id;for(const [k,v] of Object.entries({vendor:r.vendor,po:r.po,invoice:r.invoice,amount:r.amount,invoiceDate:r.invoiceDate,dueDate:r.dueDate,status:r.status,utr:r.utr,paymentDate:r.paymentDate,notes:r.notes}))if(form.elements[k])form.elements[k].value=v;$('formTitle').textContent='Edit invoice';$('saveBtn').textContent='Save changes';$('cancelEdit').hidden=false;form.scrollIntoView({behavior:'smooth',block:'start'});}
    if(del&&activeRole==='master'){const r=records.find(x=>x.id===del.dataset.delete);if(r&&confirm(`Delete invoice ${r.invoice} for ${r.vendor}?`)){const {error}=await db.from('it_payments').delete().eq('id',r.id);if(error)toast(`Delete failed: ${error.message}`);else{toast('Invoice deleted');await fetchRecords();}}}
  });
  $('cancelEdit').addEventListener('click',()=>{editId=null;form.reset();$('formTitle').textContent='Add an invoice';$('saveBtn').textContent='Add invoice';$('cancelEdit').hidden=true;});
  $('search').addEventListener('input',render);$('vendorFilter').addEventListener('change',render);$('statusFilter').addEventListener('change',render);$('clearFilters').addEventListener('click',()=>{$('search').value='';$('vendorFilter').value='';$('statusFilter').value='';render();});

  function csvEscape(v){return '"'+String(v??'').replace(/"/g,'""')+'"';}
  function download(name,content,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;a.click();URL.revokeObjectURL(a.href);}
  $('exportBtn').addEventListener('click',()=>{const cols=['vendor','po','invoice','amount','invoiceDate','dueDate','status','utr','paymentDate','notes'];const lines=[cols,...records.map(r=>cols.map(k=>r[k]??''))].map(row=>row.map(csvEscape).join(',')).join('\r\n');download('it-payment-tracker.csv','\ufeff'+lines,'text/csv;charset=utf-8');});
  $('backupBtn').addEventListener('click',()=>download(`it-payment-backup-${today()}.json`,JSON.stringify(records,null,2),'application/json'));
  $('importBtn').addEventListener('click',()=>$('importModal').classList.add('show'));
  $('closeImport').addEventListener('click',()=>$('importModal').classList.remove('show'));
  $('restoreBtn').addEventListener('click',()=>$('restoreFile').click());
  $('restoreFile').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{const data=JSON.parse(await file.text());if(!Array.isArray(data)||data.some(x=>!x.vendor||!x.po||!x.invoice||!Number(x.amount)))throw new Error();if(confirm(`Import ${data.length} invoices from this backup? Duplicate vendor/PO/invoice combinations may be rejected.`)){const payload=data.map(x=>({...dbRow({vendor:x.vendor,po:x.po,invoice:x.invoice,amount:x.amount,invoiceDate:x.invoiceDate||x.invoice_date||'',dueDate:x.dueDate||x.due_date||'',status:x.status||'Pending',utr:x.utr||'',paymentDate:x.paymentDate||x.payment_date||'',notes:x.notes||''}),created_by:currentUser.id}));const {error}=await db.from('it_payments').insert(payload);if(error)throw error;await fetchRecords();toast(`${payload.length} invoices restored`);}}catch(error){alert(`Backup could not be imported. ${error.message||''}`);}e.target.value='';});
  function parseCSV(s){let rows=[],row=[],val='',quoted=false;for(let i=0;i<s.length;i++){const c=s[i];if(quoted){if(c==='"'&&s[i+1]==='"'){val+='"';i++;}else if(c==='"')quoted=false;else val+=c;}else if(c==='"')quoted=true;else if(c===','){row.push(val);val='';}else if(c==='\n'){row.push(val.replace(/\r$/,''));if(row.some(x=>x.trim()))rows.push(row);row=[];val='';}else val+=c;}row.push(val.replace(/\r$/,''));if(row.some(x=>x.trim()))rows.push(row);return rows;}
  $('runImport').addEventListener('click',async()=>{const rows=parseCSV($('csvText').value);if(rows.length<2){toast('Paste a header row and at least one record');return;}const headers=rows.shift().map(x=>x.trim().toLowerCase()),required=['vendor','po','invoice','amount'];if(required.some(k=>!headers.includes(k))){alert('Required headers are vendor, po, invoice, and amount.');return;}const payload=[];for(const cells of rows){const x=Object.fromEntries(headers.map((h,i)=>[h,(cells[i]||'').trim()]));if(!x.vendor||!x.po||!x.invoice||!Number(x.amount))continue;payload.push({...dbRow({vendor:x.vendor,po:x.po,invoice:x.invoice,amount:x.amount,invoiceDate:x.invoicedate||'',dueDate:x.duedate||'',status:x.status||'Pending',utr:x.utr||'',paymentDate:x.paymentdate||'',notes:x.notes||''}),created_by:currentUser.id});}if(!payload.length){toast('No valid invoice rows found');return;}const {error}=await db.from('it_payments').insert(payload);if(error){toast(`Import failed: ${error.message}`);return;}await fetchRecords();$('importModal').classList.remove('show');$('csvText').value='';toast(`${payload.length} invoice${payload.length===1?'':'s'} imported`);});

  async function fetchUsers(){const {data,error}=await db.from('it_user_roles').select('user_id,email,role,active').order('email');if(error){if(isMissingActiveField(error)){$('userRows').innerHTML='<tr><td colspan="4">Account controls are waiting for the database migration. Ask the project owner to run supabase-deactivate-users.sql in Supabase SQL Editor.</td></tr>';return;}throw error;}$('userRows').innerHTML=(data||[]).map(u=>`<tr><td>${esc(u.email)}</td><td><select data-user-role="${esc(u.user_id)}" ${u.user_id===currentUser.id?'disabled':''}><option value="user" ${u.role==='user'?'selected':''}>User</option><option value="master" ${u.role==='master'?'selected':''}>Master</option></select></td><td><span class="badge ${u.active?'paid':'pending'}">${u.active?'Active':'Deactivated'}</span></td><td>${u.user_id===currentUser.id?'Current account':`<div class="row-actions"><button class="icon-btn" data-save-role="${esc(u.user_id)}">Save role</button><button class="icon-btn ${u.active?'danger':''}" data-toggle-active="${esc(u.user_id)}" data-next-active="${u.active?'false':'true'}">${u.active?'Deactivate':'Reactivate'}</button></div>`}</td></tr>`).join('');}
  $('userRows').addEventListener('click',async e=>{
    const roleButton=e.target.closest('[data-save-role]');
    if(roleButton){const id=roleButton.dataset.saveRole,select=document.querySelector(`[data-user-role="${CSS.escape(id)}"]`);if(!select||id===currentUser.id)return;const {error}=await db.from('it_user_roles').update({role:select.value}).eq('user_id',id);if(error)toast(`Role update failed: ${error.message}`);else{toast('User role updated');await fetchUsers();}return;}
    const statusButton=e.target.closest('[data-toggle-active]');
    if(!statusButton)return;
    const id=statusButton.dataset.toggleActive,activate=statusButton.dataset.nextActive==='true';
    if(id===currentUser.id)return;
    const account=(await db.from('it_user_roles').select('email').eq('user_id',id).maybeSingle()).data;
    if(!activate&&account&&!confirm(`Deactivate ${account.email}? They will lose access to the tracker.`))return;
    const {error}=await db.rpc('set_it_user_active',{target_user_id:id,should_be_active:activate});
    if(error)toast(`Account status update failed: ${error.message}`);else{toast(activate?'User account reactivated':'User account deactivated');await fetchUsers();}
  });

  async function restoreSession(){
    if(!cfg.supabaseUrl||!cfg.supabasePublishableKey){$('welcomePage').hidden=true;$('loginPage').hidden=false;lockPage('Secure sign-in is not connected yet. The tracker administrator must configure the database before anyone can sign in.');return;}
    if(!window.supabase?.createClient){$('welcomePage').hidden=true;$('loginPage').hidden=false;lockPage('The sign-in service could not load. Refresh the page or contact the tracker administrator.');return;}
    const authFlow=new URLSearchParams(window.location.hash.slice(1)).get('type');
    const passwordSetupFlow=authFlow==='recovery'||authFlow==='invite';
    db=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    db.auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY'||(event==='SIGNED_IN'&&authFlow==='invite')){$('appShell').hidden=true;$('welcomePage').hidden=true;$('loginPage').hidden=false;$('loginForm').hidden=true;$('newPasswordForm').hidden=false;$('authError').textContent='';}});
    if(passwordSetupFlow){$('welcomePage').hidden=true;$('loginPage').hidden=false;$('loginForm').hidden=true;$('newPasswordForm').hidden=false;return;}
    const {data,error}=await db.auth.getSession();if(error)return;
    if(data.session){try{const role=await getAssignedRole(data.session.user);await openApp(data.session.user,role);}catch{await db.auth.signOut();}}
  }
  restoreSession();
})();
