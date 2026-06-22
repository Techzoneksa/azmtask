# AZM Tasks - Production Stable Release

## System Information

- **System Name**: برنامج عزم للإنجاز والتشغيل
- **Domain**: https://azm.promksa.com
- **Repository**: https://github.com/Techzoneksa/azmtask.git
- **Release Status**: Stable Production

## Version Details

- **Version**: 1.0.0
- **Build Date**: 2026-06-22
- **Last Commit**: cf31fd7
- **Release Tag**: stable-production-azm-task-v1

## Database

- **Provider**: Supabase (PostgreSQL)
- **Project**: azmtask

## Tables Used

| Table | Purpose |
|-------|---------|
| tasks | المهام التشغيلية |
| setup_phases | مراحل التأسيس والتشغيل |
| blockers | التحديات التشغيلية |
| documents | المستندات والسجلات |
| attendance | الحضور والانصراف |
| notes | الملاحظات |
| profiles | بيانات المستخدمين |

## Supabase Schema Notes

### Column Names (Correct - DO NOT CHANGE)

| Table | Column | Type |
|-------|--------|------|
| tasks | phase_id | uuid |
| tasks | due_date | date |
| tasks | work_date | date |
| tasks | sort_order | integer |
| tasks | user_id | uuid |
| setup_phases | title | text |
| setup_phases | sort_order | integer |
| attendance | work_date | date |
| attendance | check_in_time | timestamptz |
| attendance | check_out_time | timestamptz |
| attendance | total_hours | numeric |

### Common Mistakes to Avoid

- DO NOT use `name` for setup_phases - use `title`
- DO NOT use `order` - use `sort_order`
- DO NOT use `date` - use `work_date` for attendance
- DO NOT use `stage_id` - use `phase_id`
- DO NOT use generated IDs with prefixes like `att-`, `task-`, `note-`

## Verification Checklist

- [ ] Login page works without hardcoded credentials
- [ ] Dashboard loads with stats and charts
- [ ] Task editing works (pencil icon in Kanban)
- [ ] Task creation works
- [ ] Phase editing works (sends `title` not `name`)
- [ ] Attendance check-in/check-out works
- [ ] Notes section works
- [ ] Obstacles section works
- [ ] Documents section works
- [ ] Reports section works
- [ ] Dark/Light mode works
- [ ] No critical 400/406 errors in console

## Important Warnings

### DO NOT MODIFY SUPABASE SCHEMA WITHOUT:

1. Reviewing the column names in this document
2. Testing changes in development first
3. Updating the code to match any new column names
4. Ensuring no hardcoded credentials exist

### SERVICE WORKER WARNING:

- Service Worker is configured with PWA
- Cache versioning must be properly managed
- Do not activate SW with stale cache during development
- Clear cache before deploying new versions

### ENVIRONMENT VARIABLES:

- All Supabase variables use `VITE_` prefix
- Variables are injected at build time on Hostinger
- Do NOT store real credentials in code

## Deployment Instructions

1. Pull latest from GitHub
2. Run `npm run build`
3. Verify dist/ folder content
4. Upload to Hostinger
5. Clear browser cache if needed
6. Test the deployed version

## Emergency Rollback

If issues occur after deployment:

1. Identify the last stable commit
2. Revert to previous version
3. Rebuild and redeploy

**Last Stable Tag**: stable-production-azm-task-v1