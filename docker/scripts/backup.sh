#!/bin/bash
# =============================================================================
# AI Trading Platform - Database Backup Script
# Automated backup for PostgreSQL with retention policy
# =============================================================================

set -euo pipefail

# Configuration
DB_HOST="postgres"
DB_PORT="5432"
DB_NAME="${POSTGRES_DB:-trading_platform}"
DB_USER="${POSTGRES_USER:-trading_user}"
BACKUP_DIR="/backups"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/trading_platform_backup_${TIMESTAMP}.sql"
BACKUP_COMPRESSED="${BACKUP_FILE}.gz"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "${BACKUP_DIR}/backup.log"
}

# Error handling
error_exit() {
    log "ERROR: $1"
    exit 1
}

# Check if PostgreSQL is accessible
check_database() {
    log "Checking database connectivity..."
    if pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME"; then
        log "Database is ready"
    else
        error_exit "Database is not accessible"
    fi
}

# Create backup directory
create_backup_dir() {
    if [[ ! -d "$BACKUP_DIR" ]]; then
        mkdir -p "$BACKUP_DIR" || error_exit "Failed to create backup directory"
    fi
    log "Backup directory: $BACKUP_DIR"
}

# Perform database backup
perform_backup() {
    log "Starting database backup..."

    # Create the backup
    if pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        --no-password --verbose --clean --if-exists --create \
        --format=custom --compress=9 \
        --file="$BACKUP_FILE" 2>&1 | tee -a "${BACKUP_DIR}/backup.log"; then

        log "Database backup completed successfully"
        log "Backup file: $BACKUP_FILE"

        # Get backup file size
        BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
        log "Backup size: $BACKUP_SIZE"

    else
        error_exit "Database backup failed"
    fi
}

# Compress backup if not already compressed
compress_backup() {
    if [[ "$BACKUP_FILE" != *.gz ]]; then
        log "Compressing backup file..."
        if gzip -f "$BACKUP_FILE"; then
            log "Backup compressed successfully: $BACKUP_COMPRESSED"
            BACKUP_FILE="$BACKUP_COMPRESSED"
        else
            log "Warning: Compression failed, keeping uncompressed backup"
        fi
    fi
}

# Verify backup integrity
verify_backup() {
    log "Verifying backup integrity..."

    if [[ "$BACKUP_FILE" == *.gz ]]; then
        # For compressed files
        if gunzip -t "$BACKUP_FILE" 2>/dev/null; then
            log "Backup integrity verified (compressed)"
        else
            error_exit "Backup integrity check failed (compressed)"
        fi
    else
        # For custom format dumps
        if pg_restore --list "$BACKUP_FILE" >/dev/null 2>&1; then
            log "Backup integrity verified (custom format)"
        else
            error_exit "Backup integrity check failed (custom format)"
        fi
    fi
}

# Clean old backups
cleanup_old_backups() {
    log "Cleaning up backups older than $RETENTION_DAYS days..."

    DELETED_COUNT=0
    while IFS= read -r -d '' file; do
        log "Deleting old backup: $(basename "$file")"
        rm -f "$file"
        ((DELETED_COUNT++))
    done < <(find "$BACKUP_DIR" -name "trading_platform_backup_*.sql*" -type f -mtime "+$RETENTION_DAYS" -print0)

    log "Deleted $DELETED_COUNT old backup(s)"
}

# Create backup summary
create_summary() {
    local SUMMARY_FILE="${BACKUP_DIR}/backup_summary_${TIMESTAMP}.txt"

    cat > "$SUMMARY_FILE" << EOF
AI Trading Platform - Database Backup Summary
=============================================
Backup Date: $(date)
Database: $DB_NAME
Backup File: $(basename "$BACKUP_FILE")
Backup Size: $(du -h "$BACKUP_FILE" | cut -f1)
Retention Period: $RETENTION_DAYS days

Database Statistics:
- Total Tables: $(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")
- Total Size: $(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT pg_size_pretty(pg_database_size('$DB_NAME'));")

Recent Activity:
- Recent Trades (24h): $(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT count(*) FROM trades WHERE timestamp > EXTRACT(EPOCH FROM (NOW() - INTERVAL '24 hours')) * 1000;")
- Open Positions: $(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT count(*) FROM positions WHERE status = 'OPEN';")
- Active Arbitrage Opportunities: $(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT count(*) FROM arbitrage_opportunities WHERE status = 'ACTIVE';")

EOF

    log "Backup summary created: $SUMMARY_FILE"
}

# Send notification (optional)
send_notification() {
    local WEBHOOK_URL="${ALERT_WEBHOOK_URL:-}"

    if [[ -n "$WEBHOOK_URL" ]]; then
        local MESSAGE="✅ **AI Trading Platform Backup Completed**

📅 **Date:** $(date)
🗄️ **Database:** $DB_NAME
📁 **File:** $(basename "$BACKUP_FILE")
📊 **Size:** $(du -h "$BACKUP_FILE" | cut -f1)
🗑️ **Cleanup:** Deleted $DELETED_COUNT old backup(s)"

        curl -X POST -H 'Content-type: application/json' \
            --data "{\"content\":\"$MESSAGE\"}" \
            "$WEBHOOK_URL" 2>/dev/null || log "Warning: Failed to send notification"
    fi
}

# Main execution
main() {
    log "=== AI Trading Platform Backup Started ==="

    # Create backup directory
    create_backup_dir

    # Check database connectivity
    check_database

    # Perform backup
    perform_backup

    # Compress backup
    compress_backup

    # Verify backup
    verify_backup

    # Clean old backups
    cleanup_old_backups

    # Create summary
    create_summary

    # Send notification
    send_notification

    log "=== AI Trading Platform Backup Completed Successfully ==="
}

# Execute main function
main "$@"