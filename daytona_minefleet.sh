#!/bin/bash

# ==========================================================================
# MineFleet Daytona Launcher
# Boots a QEMU Ubuntu VM inside Daytona and runs MineFleet bots
# Uses bore.pub tunnel to bypass Daytona's port restrictions
# ==========================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m'

QEMU_RAM="7G"   # Leave ~1GB for Daytona host OS
QEMU_CPU=3      # Leave 1 core for Daytona host OS
VM_SSH_PORT=2222
DISK_IMG="/tmp/ubuntu_vm.qcow2"
CLOUD_IMG_URL="https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.img"

banner() {
    echo -e "${RED}============================================================${NC}"
    echo -e "${WHITE}       🤖  MineFleet Daytona VPS Launcher  🤖               ${NC}"
    echo -e "${RED}============================================================${NC}"
    echo -e "${CYAN}  Bypasses Daytona firewall using bore.pub TCP tunneling    ${NC}"
    echo -e "${RED}============================================================${NC}"
    echo ""
}

log()   { echo -e "${GREEN}[✓]${NC} $1"; }
info()  { echo -e "${CYAN}[i]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# --------------------------------------------------------------------------
# Step 1 — Check dependencies
# --------------------------------------------------------------------------
check_deps() {
    info "Checking dependencies..."
    for cmd in qemu-system-x86_64 curl wget ssh; do
        command -v "$cmd" >/dev/null 2>&1 || error "$cmd not found."
    done
    log "All dependencies found."
}

# --------------------------------------------------------------------------
# Step 2 — Download Ubuntu cloud image (if not cached)
# --------------------------------------------------------------------------
download_image() {
    if [ -f "$DISK_IMG" ]; then
        log "Disk image already exists — skipping download."
        return
    fi
    info "Downloading Ubuntu 22.04 cloud image (~600MB)..."
    wget -q --show-progress -O /tmp/ubuntu_base.img "$CLOUD_IMG_URL" || error "Failed to download Ubuntu image."
    info "Resizing disk to 10GB..."
    qemu-img resize /tmp/ubuntu_base.img 10G
    cp /tmp/ubuntu_base.img "$DISK_IMG"
    log "Disk image ready."
}

# --------------------------------------------------------------------------
# Step 3 — Create cloud-init (auto-setup on first boot)
# --------------------------------------------------------------------------
create_cloud_init() {
    info "Creating cloud-init config..."
    mkdir -p /tmp/cidata

    cat > /tmp/cidata/user-data <<'EOF'
#cloud-config
users:
  - name: root
    lock_passwd: false
    passwd: "$6$rounds=4096$abc$WPLHkqKDWL3lSITe9AcGDlCkd1kzIcSk2I7SQqGP14sYGdBjFjJf2lBWJVo7mGqcQ3a0VLR9IJGCiKqnBdNp0/"

chpasswd:
  expire: false

ssh_pwauth: true

runcmd:
  - apt-get update -qq
  - apt-get install -y -qq curl git
  - curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  - apt-get install -y -qq nodejs
  - npm install -g pm2 --silent
  - git clone https://github.com/Rushikesh0927/MineFleet.git /opt/MineFleet
  - cd /opt/MineFleet/MineFleet && npm install --silent
  - curl -sSL https://github.com/ekzhang/bore/releases/download/v0.5.1/bore-v0.5.1-x86_64-unknown-linux-musl.tar.gz | tar xz -C /usr/local/bin/
  - chmod +x /usr/local/bin/bore
  - touch /tmp/cloud_init_done
EOF

    echo "instance-id: minefleet-vm" > /tmp/cidata/meta-data

    if command -v cloud-localds >/dev/null 2>&1; then
        cloud-localds /tmp/seed.iso /tmp/cidata/user-data /tmp/cidata/meta-data
    elif command -v genisoimage >/dev/null 2>&1; then
        genisoimage -output /tmp/seed.iso -volid cidata -joliet -rock /tmp/cidata/
    elif command -v mkisofs >/dev/null 2>&1; then
        mkisofs -output /tmp/seed.iso -volid cidata -joliet -rock /tmp/cidata/
    else
        apt-get install -y -qq cloud-image-utils 2>/dev/null
        cloud-localds /tmp/seed.iso /tmp/cidata/user-data /tmp/cidata/meta-data
    fi
    log "Cloud-init ISO created."
}

# --------------------------------------------------------------------------
# Step 4 — Boot the QEMU VM
# --------------------------------------------------------------------------
boot_vm() {
    info "Booting Ubuntu VM (${QEMU_RAM} RAM, ${QEMU_CPU} CPUs)..."
    pkill -f qemu-system-x86_64 2>/dev/null || true
    sleep 1

    qemu-system-x86_64 \
        -m "$QEMU_RAM" \
        -smp "$QEMU_CPU" \
        -drive file="$DISK_IMG",format=qcow2,if=virtio \
        -drive file=/tmp/seed.iso,format=raw,if=virtio \
        -net nic,model=virtio \
        -net user,hostfwd=tcp::"$VM_SSH_PORT"-:22 \
        -nographic \
        -no-reboot \
        -daemonize \
        -pidfile /tmp/qemu.pid \
        2>/tmp/qemu.log || error "Failed to start QEMU. Check /tmp/qemu.log"

    log "QEMU VM started (PID: $(cat /tmp/qemu.pid))."
}

# --------------------------------------------------------------------------
# Step 5 — Wait for VM to finish cloud-init
# --------------------------------------------------------------------------
wait_for_vm() {
    info "Waiting for VM to boot and setup (2-4 minutes)..."
    local attempts=0
    while [ $attempts -lt 72 ]; do
        result=$(sshpass -p "root" ssh -o StrictHostKeyChecking=no \
               -o ConnectTimeout=3 \
               root@localhost -p "$VM_SSH_PORT" \
               "test -f /tmp/cloud_init_done && echo OK" 2>/dev/null)
        if echo "$result" | grep -q "OK"; then
            log "VM is ready!"
            return 0
        fi
        echo -ne "\r${YELLOW}[!]${NC} Still booting... (${attempts}/72)"
        sleep 5
        attempts=$((attempts + 1))
    done
    error "VM did not become ready in time. Check: tail -f /tmp/qemu.log"
}

# --------------------------------------------------------------------------
# Step 6 — Start MineFleet + bore tunnel
# --------------------------------------------------------------------------
start_minefleet() {
    info "Starting MineFleet bots inside VM..."

    local SSHOPTS="-o StrictHostKeyChecking=no -p $VM_SSH_PORT"

    # Install sshpass if needed
    command -v sshpass >/dev/null 2>&1 || apt-get install -y -qq sshpass 2>/dev/null

    sshpass -p "root" ssh $SSHOPTS root@localhost \
        "cd /opt/MineFleet/MineFleet && pm2 start index.js --name minefleet && pm2 save"
    log "MineFleet started via pm2!"

    info "Starting bore tunnel (outbound via HTTPS port 443 — bypasses Daytona firewall)..."
    sshpass -p "root" ssh $SSHOPTS root@localhost \
        "nohup bore local 0 --to bore.pub &>/tmp/bore.log & sleep 2 && cat /tmp/bore.log | head -5"

    echo ""
    echo -e "${GREEN}============================================================${NC}"
    echo -e "${WHITE}  ✅  MineFleet is RUNNING inside the VM!                   ${NC}"
    echo -e "${GREEN}============================================================${NC}"
    echo ""
    echo -e "${CYAN}  View bot logs:${NC}"
    echo -e "  sshpass -p root ssh $SSHOPTS root@localhost 'pm2 logs minefleet --lines 50'"
    echo ""
    echo -e "${CYAN}  SSH into VM:${NC}"
    echo -e "  sshpass -p root ssh $SSHOPTS root@localhost"
    echo ""
    echo -e "${CYAN}  Stop bots:${NC}"
    echo -e "  sshpass -p root ssh $SSHOPTS root@localhost 'pm2 stop minefleet'"
    echo -e "${GREEN}============================================================${NC}"
}

# ==========================================================================
# MAIN
# ==========================================================================
banner
check_deps
download_image
create_cloud_init
boot_vm
wait_for_vm
start_minefleet
