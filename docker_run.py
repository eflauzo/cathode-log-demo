import argparse
import logging
import os
import sys
import webbrowser

import docker


parser = argparse.ArgumentParser(description='Clean build of afterblow-log-demo-dev')
parser.add_argument('--force', action='store_true')
parser.add_argument('--build', action='store_true')
parser.add_argument('--run', action='store_true')

args = parser.parse_args()

dir_path = os.path.dirname(os.path.realpath(__file__))
client = docker.from_env()

AFTERGLOW_LOG_DEMO_DEV_IMAGE = 'afterglow_log_demo_dev'

def build_image():
    logging.info('Building image')
    client.images.build(path='build/afterglow-log-demo-dev-machine', tag=AFTERGLOW_LOG_DEMO_DEV_IMAGE)
    logging.info('Docker image finished building, checking image...')
    image = client.images.get(AFTERGLOW_LOG_DEMO_DEV_IMAGE)
    logging.info('Docker image is built successfuly')
    return image

try:
    image = client.images.get(AFTERGLOW_LOG_DEMO_DEV_IMAGE)
    if args.force:
        logging.info('Removing old image')
        client.images.remove(AFTERGLOW_LOG_DEMO_DEV_IMAGE, force=True)
        image = build_image()
except docker.errors.ImageNotFound as exc:
    logging.warning('Afterglow log demo dev image does not exists...')
    image = build_image()

logging.info('Running container...')

volumes = {
    dir_path: '/workspace'
}

ports = {
    7777: 7777
}

def passively_run_command(command, workdir):
    container = client.containers.run(
        image=AFTERGLOW_LOG_DEMO_DEV_IMAGE,
        command=command,
        ports=ports,
        volumes=volumes,
        detach=True,
        working_dir=workdir
    )
    try:
        for log in container.logs(stdout=True, stderr=True, stream=True):#, follow=False):
            sys.stdout.write(log)
    except KeyboardInterrupt as e:
        container.kill()
        raise
    except Exception as e:
        container.kill()
        raise
    print "Done..."


if args.build:
    print 'Updating packages...'
    passively_run_command('unbuffer npm install', '/workspace')

    print "Building..."
    passively_run_command('unbuffer npm run build', '/workspace')

if args.run:
    print 'Running...'
    passively_run_command('unbuffer crossbar start', '/workspace/dist')
