node ../spark-print-mgr/server.js &
print_manager_pid=$!
sleep 3
python ../spark-print-client/spark.py uploadDB ../spark-print-data/
sleep 2
jasmine-node $1
sleep 1
kill $print_manager_pid
