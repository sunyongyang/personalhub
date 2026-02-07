#!/bin/bash

# PersonalHub 部署脚本
# 适用于阿里云 CentOS/Ubuntu 服务器

set -e

echo "=========================================="
echo "  PersonalHub 部署脚本"
echo "=========================================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 配置
APP_NAME="personalhub"
APP_DIR="/opt/personalhub"
PORT=${PORT:-3000}
NODE_VERSION="18"

# 检测操作系统
detect_os() {
    if [ -f /etc/redhat-release ]; then
        OS="centos"
    elif [ -f /etc/lsb-release ]; then
        OS="ubuntu"
    else
        OS="unknown"
    fi
    echo -e "${GREEN}检测到操作系统: $OS${NC}"
}

# 安装 Node.js
install_node() {
    echo -e "${YELLOW}检查 Node.js...${NC}"
    
    if command -v node &> /dev/null; then
        NODE_VER=$(node -v)
        echo -e "${GREEN}Node.js 已安装: $NODE_VER${NC}"
        return
    fi
    
    echo -e "${YELLOW}安装 Node.js ${NODE_VERSION}...${NC}"
    
    if [ "$OS" == "centos" ]; then
        curl -fsSL https://rpm.nodesource.com/setup_${NODE_VERSION}.x | sudo bash -
        sudo yum install -y nodejs
    elif [ "$OS" == "ubuntu" ]; then
        curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi
    
    echo -e "${GREEN}Node.js 安装完成: $(node -v)${NC}"
}

# 安装 PM2
install_pm2() {
    echo -e "${YELLOW}检查 PM2...${NC}"
    
    if command -v pm2 &> /dev/null; then
        echo -e "${GREEN}PM2 已安装${NC}"
        return
    fi
    
    echo -e "${YELLOW}安装 PM2...${NC}"
    sudo npm install -g pm2
    echo -e "${GREEN}PM2 安装完成${NC}"
}

# 部署应用
deploy_app() {
    echo -e "${YELLOW}部署应用...${NC}"
    
    # 创建应用目录
    sudo mkdir -p $APP_DIR
    sudo chown -R $USER:$USER $APP_DIR
    
    # 复制文件（如果在项目目录中运行）
    if [ -f "server.js" ]; then
        echo "从当前目录复制文件..."
        cp -r ./* $APP_DIR/
    else
        echo -e "${RED}错误: 请在项目目录中运行此脚本${NC}"
        exit 1
    fi
    
    cd $APP_DIR
    
    # 创建上传目录
    mkdir -p uploads
    
    # 安装依赖
    echo -e "${YELLOW}安装依赖...${NC}"
    npm install --production
    
    echo -e "${GREEN}应用部署完成${NC}"
}

# 配置并启动服务
start_service() {
    echo -e "${YELLOW}配置服务...${NC}"
    
    cd $APP_DIR
    
    # 停止旧服务（如果存在）
    pm2 delete $APP_NAME 2>/dev/null || true
    
    # 启动服务
    PORT=$PORT pm2 start server.js --name $APP_NAME
    
    # 保存 PM2 配置
    pm2 save
    
    # 设置开机自启
    sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp $HOME
    pm2 save
    
    echo -e "${GREEN}服务启动完成${NC}"
}

# 配置防火墙
configure_firewall() {
    echo -e "${YELLOW}配置防火墙...${NC}"
    
    if [ "$OS" == "centos" ]; then
        if command -v firewall-cmd &> /dev/null; then
            sudo firewall-cmd --permanent --add-port=${PORT}/tcp 2>/dev/null || true
            sudo firewall-cmd --reload 2>/dev/null || true
        fi
    elif [ "$OS" == "ubuntu" ]; then
        if command -v ufw &> /dev/null; then
            sudo ufw allow $PORT 2>/dev/null || true
        fi
    fi
    
    echo -e "${GREEN}防火墙配置完成${NC}"
    echo -e "${YELLOW}注意: 请确保阿里云安全组已开放端口 $PORT${NC}"
}

# 显示状态
show_status() {
    echo ""
    echo "=========================================="
    echo -e "${GREEN}  部署完成！${NC}"
    echo "=========================================="
    echo ""
    echo "应用目录: $APP_DIR"
    echo "运行端口: $PORT"
    echo ""
    echo "访问地址:"
    
    # 获取服务器 IP
    SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
    echo "  http://$SERVER_IP:$PORT"
    echo ""
    echo "文件下载链接格式:"
    echo "  http://$SERVER_IP:$PORT/d/文件ID"
    echo ""
    echo "常用命令:"
    echo "  pm2 status          # 查看状态"
    echo "  pm2 logs $APP_NAME  # 查看日志"
    echo "  pm2 restart $APP_NAME  # 重启服务"
    echo "  pm2 stop $APP_NAME  # 停止服务"
    echo ""
}

# 主流程
main() {
    detect_os
    install_node
    install_pm2
    deploy_app
    start_service
    configure_firewall
    show_status
}

# 运行
main
