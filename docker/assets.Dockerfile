# 一次性资源加载镜像：只包含大资源，不包含应用代码。
#
# 构建（上下文必须是 apps/web/public，避免把 2.4GB 资源塞进应用镜像构建上下文）：
#   docker build -f docker/assets.Dockerfile \
#     -t 192.168.67.202:8443/china-study-free/assets:v1.4.0 \
#     apps/web/public
#
# 然后运行 deploy/k8s/optional/assets-loader-job.yaml 把 /src 复制到 PVC。
FROM alpine:3

WORKDIR /src
COPY audio ./audio
COPY textbook-pages ./textbook-pages
COPY story-images ./story-images

# 实际复制命令由 Job 覆盖；这里只提供数据。
CMD ["/bin/sh", "-c", "echo 'assets image; run as loader job'"]
