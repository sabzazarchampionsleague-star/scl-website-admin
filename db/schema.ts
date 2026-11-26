import {sqliteTable,integer,text,index,uniqueIndex,check} from 'drizzle-orm/sqlite-core';
import {sql} from 'drizzle-orm';
export const admins=sqliteTable('admins',{
 id:integer('id').primaryKey({autoIncrement:true}),email:text('email').notNull().unique(),password_hash:text('password_hash').notNull(),role:text('role').notNull().default('super_admin')
});
export const teams=sqliteTable('teams',{
 id:integer('id').primaryKey({autoIncrement:true}),name:text('name').notNull(),name_key:text('name_key').unique(),description:text('description').notNull().default(''),formation:text('formation').notNull().default('{"shape":"4-3-3","players":[]}'),short_name:text('short_name').notNull(),logo_url:text('logo_url').notNull().default(''),coach:text('coach').notNull().default(''),captain:text('captain').notNull().default(''),created_at:text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),owner_user_id:integer('owner_user_id').references(()=>users.id)
});
export const players=sqliteTable('players',{
 id:integer('id').primaryKey({autoIncrement:true}),team_id:integer('team_id').notNull().references(()=>teams.id,{onDelete:'cascade'}),name:text('name').notNull(),jersey_no:integer('jersey_no'),position:text('position').notNull().default(''),goals:integer('goals').notNull().default(0),assists:integer('assists').notNull().default(0),yellow_cards:integer('yellow_cards').notNull().default(0),red_cards:integer('red_cards').notNull().default(0)
 ,user_id:integer('user_id').references(()=>users.id)
},t=>[index('idx_players_team_id').on(t.team_id),uniqueIndex('idx_player_user').on(t.user_id)]);
export const matches=sqliteTable('matches',{
 id:integer('id').primaryKey({autoIncrement:true}),home_team_id:integer('home_team_id').notNull().references(()=>teams.id),away_team_id:integer('away_team_id').notNull().references(()=>teams.id),match_date:text('match_date').notNull(),venue:text('venue').notNull().default(''),status:text('status').notNull().default('scheduled'),home_score:integer('home_score').notNull().default(0),away_score:integer('away_score').notNull().default(0),minute:integer('minute').notNull().default(0),phase:text('phase').notNull().default(''),motm:text('motm').notNull().default('')
});
export const news=sqliteTable('news',{
 id:integer('id').primaryKey({autoIncrement:true}),title:text('title').notNull(),body:text('body').notNull(),published_at:text('published_at').notNull().default(sql`CURRENT_TIMESTAMP`)
});
export const sessions=sqliteTable('sessions',{
 token_hash:text('token_hash').primaryKey(),admin_id:integer('admin_id').notNull().references(()=>admins.id,{onDelete:'cascade'}),expires:integer('expires').notNull()
},t=>[index('idx_sessions_expires').on(t.expires),index('idx_sessions_admin').on(t.admin_id)]);
export const loginLimits=sqliteTable('login_limits',{
 key:text('key').primaryKey(),attempts:integer('attempts').notNull(),expires:integer('expires').notNull()
},t=>[index('idx_login_limits_expires').on(t.expires)]);
export const users=sqliteTable('users',{id:integer('id').primaryKey({autoIncrement:true}),name:text('name').notNull(),email:text('email').notNull().unique(),password_hash:text('password_hash'),google_sub:text('google_sub').unique(),created_at:text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`)});
export const userSessions=sqliteTable('user_sessions',{token_hash:text('token_hash').primaryKey(),user_id:integer('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),expires:integer('expires').notNull()},t=>[index('idx_user_sessions_expires').on(t.expires)]);
export const oauthStates=sqliteTable('oauth_states',{state_hash:text('state_hash').primaryKey(),nonce:text('nonce').notNull(),verifier:text('verifier').notNull(),expires:integer('expires').notNull()});
export const applications=sqliteTable('applications',{id:integer('id').primaryKey({autoIncrement:true}),user_id:integer('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),team_id:integer('team_id').notNull().references(()=>teams.id,{onDelete:'cascade'}),position:text('position').notNull(),message:text('message').notNull().default(''),status:text('status').notNull().default('pending'),created_at:text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`)},t=>[uniqueIndex('idx_application_unique').on(t.user_id,t.team_id),index('idx_application_team').on(t.team_id,t.status),check('application_status',sql`${t.status} IN ('pending','approved','rejected')`)]);
export const teamLogos=sqliteTable('team_logos',{team_id:integer('team_id').primaryKey().references(()=>teams.id,{onDelete:'cascade'}),data:text('data').notNull()});

export const playerProfiles=sqliteTable('player_profiles',{user_id:integer('user_id').primaryKey().references(()=>users.id,{onDelete:'cascade'}),position:text('position').notNull().default(''),bio:text('bio').notNull().default('')});
export const events=sqliteTable('events',{id:integer('id').primaryKey({autoIncrement:true}),title:text('title').notNull(),description:text('description').notNull(),event_date:text('event_date').notNull(),venue:text('venue').notNull().default(''),status:text('status').notNull().default('open'),entry_type:text('entry_type').notNull().default('both')});
export const eventEntries=sqliteTable('event_entries',{id:integer('id').primaryKey({autoIncrement:true}),event_id:integer('event_id').notNull().references(()=>events.id,{onDelete:'cascade'}),user_id:integer('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),team_id:integer('team_id').references(()=>teams.id,{onDelete:'set null'}),entry_key:text('entry_key').notNull(),message:text('message').notNull().default(''),status:text('status').notNull().default('pending'),email_status:text('email_status').notNull().default('pending'),created_at:text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`)},t=>[uniqueIndex('idx_event_entry').on(t.event_id,t.entry_key)]);
