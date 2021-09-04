clear:
	for i in `seq 0 3`; do rm -f ./configs/node$${i}/terrad/config/write*; done;


start:
	docker-compose up -d

stop:
	docker-compose down --remove-orphans

oracle_status:
	curl http://192.168.10.2:1317/oracle/denoms/exchange_rates